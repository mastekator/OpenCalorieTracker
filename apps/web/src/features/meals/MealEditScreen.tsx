import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Redirect, useLocation, useSearch } from 'wouter';
import { Camera, Plus, Sparkle, UtensilsCrossed, X } from 'lucide-react';
import { z } from 'zod';
import {
  DISH_GRAMS,
  mealTypeAt,
  round1,
  scaleItem,
  type MealInput,
  type MealItemInput,
  type MealType,
  type Units,
  uuid,
} from '@oct/shared';
import { api, ApiError } from '../../api/client';
import { useDb, useSettings } from '../../data/DataContext';
import { createMeal } from '../../data/outbox';
import { useT } from '../../i18n';
import { useBarVariant } from '../../app/connection';
import { useSession } from '../../app/SessionContext';
import { useDirty } from '../../app/dirty';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { DishRow } from '../../ui/DishRow/DishRow';
import { DishSheet } from '../../ui/DishSheet/DishSheet';
import {
  ManualDishSheet,
  type ManualDish,
} from '../../ui/ManualDishSheet/ManualDishSheet';
import { MealTypeSegment } from '../../ui/MealTypeSegment/MealTypeSegment';
import { NavBar } from '../../ui/NavBar/NavBar';
import { OfflineBar, useOnline } from '../../ui/OfflineBar/OfflineBar';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { useToast } from '../../ui/Toast/Toast';
import type { TodayState } from '../diary/TodayScreen';
import { MEAL_NEW_PATH, useCapture } from './CaptureContext';
import type { MealEditState } from './RecognitionScreen';
import { ImageDecodeError, prepareImage } from './prepareImage';
import './MealEditScreen.css';

type Dish = ManualDish & { confidence?: number };
/** Why the manual sheet opened (MealEditState); set: no AI dishes came. */
type ManualReason = Extract<MealEditState, { manual: unknown }>['manual'];

type Row = {
  /** Stable key: rows are deleted and put back in place (4.5). */
  id: string;
  /** As recognized or entered, with the current name: every recalculation starts from here (AC-3.2). */
  original: Dish;
  source: 'ai' | 'manual';
  /** Null while the weight field is invalid (AC-3.4). */
  grams: number | null;
  /** Last valid weight: the numbers stay on it while the field is invalid. */
  shown: number;
  /** Weight or name edited: the confidence badge goes (AC-2.9). */
  edited: boolean;
};

const photoSchema = z.object({ photoId: z.string() });

const inRange = (g: number) => g >= DISH_GRAMS.min && g <= DISH_GRAMS.max;

function toRow(original: Dish, source: Row['source'] = 'ai'): Row {
  // AI grams may carry any decimals; the API takes one (mealItemInputSchema).
  const g = round1(original.grams);
  return {
    id: uuid(),
    original,
    source,
    grams: inRange(g) ? g : null,
    shown: g,
    edited: false,
  };
}

const itemOf = (row: Row): MealItemInput => {
  const { name, kcal, proteinG, fatG, carbsG, grams, confidence } = scaleItem(
    row.original,
    row.shown,
  );
  return {
    name,
    grams,
    kcal,
    proteinG,
    fatG,
    carbsG,
    source: row.source,
    // A manual dish has no confidence (AC-3.9).
    ...(row.source === 'ai' && !row.edited && { confidence }),
  };
};

type Props = {
  /** Recognized dishes; empty for manual entry. */
  dishes: Dish[];
  /** Set: the manual sheet opens at once; other than 'user', a banner says why (5.3). */
  manual?: ManualReason;
  photoId?: string;
  units: Units;
  /**
   * Writes the meal; a rejection keeps the edits and offers «Try again» (E-4.3).
   * `photo`: added from the photo slot while its upload failed, queued with the meal.
   */
  onSave: (input: MealInput, photo?: Blob) => Promise<void>;
  onClose: () => void;
  /** When the screen opened; also the time eaten. */
  now?: Date;
};

/** Screen 4 (design OCT-16 §3, E.2): dishes, weights with live totals, meal type, save. */
export function MealEditScreen({
  dishes,
  manual,
  photoId,
  units,
  onSave,
  onClose,
  now,
}: Props) {
  const { t, num, locale } = useT();
  const online = useOnline();
  const [opened] = useState(() => now ?? new Date());
  // The idempotency key lives as long as the screen: «Try again» resends the same meal (4.8).
  const [clientId] = useState(uuid);
  const [rows, setRows] = useState(() => dishes.map((d) => toRow(d)));
  const [mealType, setMealType] = useState<MealType>(() =>
    mealTypeAt(opened.getHours()),
  );
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(manual !== undefined); // AC-5.5, 5.3
  // Recognized, uploaded from the slot, or kept on the device when the upload failed.
  const [photo, setPhoto] = useState<
    { id: string; url: string } | { blob: Blob; url: string } | null
  >(() =>
    photoId
      ? {
          id: photoId,
          url: `/api/photos/${encodeURIComponent(photoId)}?size=preview`,
        }
      : null,
  );
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  // Row whose pencil gets focus after a delete or «Undo», so it never drops to <body> (WCAG 2.4.3).
  const focusRow = useRef<string | null>(null);
  const toast = useToast();
  const capture = useCapture();

  const items = rows.map(itemOf);
  const total = (k: 'kcal' | 'proteinG' | 'fatG' | 'carbsG') =>
    items.reduce((s, i) => s + i[k], 0);
  const valid = rows.length > 0 && rows.every((r) => r.grams !== null);

  const setGrams = (index: number, grams: number | null) =>
    setRows((rs) =>
      rs.map((r, i) =>
        i === index
          ? { ...r, grams, shown: grams ?? r.shown, edited: true }
          : r,
      ),
    );

  // Removed and put back in place by «Undo» (4.5); after leaving the screen «Undo» does nothing.
  const remove = (id: string) => {
    const index = rows.findIndex((r) => r.id === id);
    const row = rows[index];
    if (!row) return;
    // Next row, else the previous one; with none left the empty state takes focus.
    focusRow.current = (rows[index + 1] ?? rows[index - 1])?.id ?? null;
    setRows((rs) => rs.filter((r) => r.id !== id));
    toast({
      text: t('edit.deleted', { dish: row.original.name }),
      ms: 5000,
      action: {
        label: t('common.undo'),
        onClick: () => {
          focusRow.current = row.id;
          setRows((rs) => [...rs.slice(0, index), row, ...rs.slice(index)]);
        },
      },
    });
  };

  const applySheet = (id: string, name: string, grams: number) => {
    setEditing(null);
    setRows((rs) =>
      rs.map((r) =>
        r.id === id
          ? {
              ...r,
              original: { ...r.original, name },
              grams,
              shown: grams,
              edited: r.edited || name !== r.original.name || grams !== r.grams,
            }
          : r,
      ),
    );
  };

  const addManual = (dish: ManualDish) => {
    setAdding(false);
    const row = toRow(dish, 'manual');
    focusRow.current = row.id;
    setRows((rs) => [...rs, row]);
  };

  // The slot photo never goes to the AI (AC-5.7).
  const onPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    let blob: Blob | undefined;
    try {
      blob = await prepareImage(file);
      const { photoId: id } = await api('/api/photos', photoSchema, {
        method: 'POST',
        body: blob,
      });
      setPhoto({
        id,
        url: `/api/photos/${encodeURIComponent(id)}?size=preview`,
      });
    } catch (err) {
      if (blob && err instanceof ApiError && err.status === 0)
        // No network: the outbox uploads it with the meal (ADR-0008).
        setPhoto({ blob, url: URL.createObjectURL(blob) });
      else if (
        err instanceof ImageDecodeError ||
        (err instanceof ApiError &&
          (err.code === 'photo_invalid' || err.code === 'photo_too_large'))
      )
        toast({ text: t('capture.err.open.title') });
      else if (err instanceof ApiError)
        toast({ text: t('capture.upload_failed') });
      else throw err;
    } finally {
      setUploading(false);
    }
  };
  const photoUrl = photo?.url;
  useEffect(
    () => () => {
      if (photoUrl?.startsWith('blob:')) URL.revokeObjectURL(photoUrl);
    },
    [photoUrl],
  );

  /** Resolves true once saved; false when invalid, already saving or failed (the screen shows why). */
  async function save() {
    if (saving.current || !valid) return false; // a second tap sends nothing (E-4.2)
    saving.current = true;
    setStatus('saving');
    try {
      await onSave(
        {
          clientId,
          eatenAt: opened.toISOString(),
          tzOffsetMin: -opened.getTimezoneOffset(),
          localDate: opened.toLocaleDateString('sv'),
          mealType,
          ...(photo && 'id' in photo && { photoId: photo.id }),
          // Entered by hand because of the AI, with a photo: recalculable later (5.6).
          ...(manual && manual !== 'user' && photo && { recalcOffer: true }),
          items,
        },
        photo && 'blob' in photo ? photo.blob : undefined,
      );
      return true;
    } catch {
      saving.current = false;
      setStatus('error');
      return false;
    }
  }

  // Leaving always asks while there are dishes, edited or not (4.7, AC-3.12).
  useDirty(rows.length > 0, save, {
    title: t('edit.leave.title'),
    body: t(dishes.length ? 'edit.leave.body' : 'edit.leave.body_manual'),
  });

  // Runs after the sheet's cleanup, which returns focus to its (possibly deleted) opener.
  useEffect(() => {
    const id = focusRow.current;
    focusRow.current = null;
    if (id)
      document
        .querySelector<HTMLElement>(`[data-row="${id}"] .dish-row__edit`)
        ?.focus();
  }, [rows]);

  const keys = useRef({ save, onClose });
  keys.current = { save, onClose };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void keys.current.save();
      } else if (e.key === 'Escape' && !e.defaultPrevented) {
        keys.current.onClose(); // the leave guard asks (4.7)
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const time = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(opened);
  const busy = status === 'saving';
  const editingRow = rows.find((r) => r.id === editing);

  return (
    <div className="meal-edit">
      <OfflineBar variant={useBarVariant()} />
      <div className="meal-edit__window">
        <NavBar
          title={t('edit.title', { day: t('day.today'), time })}
          action={{ icon: X, label: t('common.close'), onClick: onClose }}
        />
        {manual && manual !== 'user' && (
          <div className="meal-edit__error">
            <Banner tone="notice">
              {t(
                manual === 'ai_down'
                  ? 'manual_dish.ai_down'
                  : `recog.${manual}`,
              )}
            </Banner>
          </div>
        )}
        {status === 'error' && (
          <div className="meal-edit__error">
            <Banner tone="danger" title={t('edit.save_err.title')}>
              {t('edit.save_err.body')}
            </Banner>
          </div>
        )}
        <div className="meal-edit__body">
          <aside className="meal-edit__summary meal-edit__summary--photo">
            {photo ? (
              <img className="meal-edit__thumb" src={photo.url} alt="" />
            ) : (
              <button
                type="button"
                className="meal-edit__thumb meal-edit__photo-add"
                disabled={uploading}
                aria-busy={uploading || undefined}
                onClick={() => photoInput.current?.click()}
              >
                <Camera aria-hidden="true" />
                {t('edit.photo.add')}
              </button>
            )}
            <div className="meal-edit__total tabular-nums">
              <p className="meal-edit__kcal">
                {num(total('kcal'))}{' '}
                <span className="meal-edit__unit">{t('today.kcal')}</span>
              </p>
              <p className="meal-edit__macros">
                {(
                  [
                    ['protein', 'proteinG'],
                    ['fat', 'fatG'],
                    ['carbs', 'carbsG'],
                  ] as const
                ).map(([macro, key]) => (
                  <span key={macro}>
                    <i
                      className={`meal-edit__dot meal-edit__dot--${macro}`}
                      aria-hidden="true"
                    />
                    {t(`macro.${macro}`)} {num(total(key))} {t('macro.g')}
                  </span>
                ))}
              </p>
            </div>
            {rows.some((r) => r.source === 'ai') && (
              <p className="meal-edit__estimate">
                <Sparkle aria-hidden="true" />
                {t('edit.estimate')}
              </p>
            )}
          </aside>
          <div className="meal-edit__main">
            <MealTypeSegment value={mealType} onChange={setMealType} />
            {rows.length > 0 ? (
              <ul className="meal-edit__list">
                {rows.map((row, i) => {
                  const item = items[i]!;
                  return (
                    <li key={row.id} data-row={row.id}>
                      <DishRow
                        dish={{
                          ...item,
                          grams: row.grams,
                          confidence: item.confidence,
                        }}
                        units={units}
                        onGramsChange={(g) => setGrams(i, g)}
                        onEdit={() => setEditing(row.id)}
                        onDelete={() => remove(row.id)}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : dishes.length > 0 ? (
              // 4.6: every recognized dish deleted.
              <ScreenState
                icon={<UtensilsCrossed />}
                title={t('edit.empty.title')}
                focusTitle
                action={
                  <>
                    <Button variant="tonal" onClick={() => setAdding(true)}>
                      {t('edit.add_manual')}
                    </Button>
                    <Button variant="plain" onClick={capture.camera}>
                      {t('common.retake')}
                    </Button>
                  </>
                }
              >
                {t('edit.empty.body')}
              </ScreenState>
            ) : (
              <p className="meal-edit__empty">{t('edit.empty_manual')}</p>
            )}
            {(rows.length > 0 || dishes.length === 0) && (
              <Button variant="plain" onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" className="meal-edit__add-icon" />
                {t('edit.add_manual')}
              </Button>
            )}
          </div>
        </div>
        <footer className="meal-edit__footer">
          {!online && (
            <p className="meal-edit__note">{t('edit.offline_note')}</p>
          )}
          <div className="meal-edit__actions">
            <span className="meal-edit__cancel">
              <Button variant="plain" onClick={onClose}>
                {t('common.cancel')}
              </Button>
            </span>
            <Button
              onClick={() => void save()}
              disabled={!valid}
              loading={busy}
            >
              {t(
                busy
                  ? 'edit.saving'
                  : status === 'error'
                    ? 'common.retry'
                    : 'edit.save',
              )}
            </Button>
          </div>
        </footer>
      </div>
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        hidden
        data-testid="edit-photo"
        onChange={(e) => void onPhoto(e)}
      />
      {adding && (
        <ManualDishSheet
          units={units}
          onAdd={addManual}
          onClose={() => setAdding(false)}
        />
      )}
      {editingRow && (
        <DishSheet
          original={editingRow.original}
          grams={editingRow.grams ?? editingRow.shown}
          units={units}
          onDone={(name, grams) => applySheet(editingRow.id, name, grams)}
          onDelete={() => {
            setEditing(null);
            remove(editingRow.id);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * MEAL_EDIT_PATH: dishes come in `history.state` from the recognition screen. After a
 * reload the state is gone: recognize the same photo again, the server answers from cache.
 */
export function MealEditRoute() {
  const db = useDb();
  const settings = useSettings();
  const { user } = useSession();
  const [, navigate] = useLocation();
  const search = useSearch();
  const photoId = new URLSearchParams(search).get('photo') ?? undefined;
  const [state] = useState(() => history.state as MealEditState | null);
  if (!state && photoId)
    return <Redirect to={`${MEAL_NEW_PATH}?${search}`} replace />;
  return (
    <MealEditScreen
      dishes={state && 'dishes' in state ? state.dishes : []}
      manual={state && 'manual' in state ? state.manual : undefined}
      photoId={photoId}
      units={settings?.units ?? user?.units ?? 'metric'}
      onSave={async (input, photo) => {
        await createMeal(db, input, photo);
        navigate('/', {
          replace: true,
          state: { saved: input.clientId } satisfies TodayState,
        });
      }}
      onClose={() => navigate('/')}
    />
  );
}
