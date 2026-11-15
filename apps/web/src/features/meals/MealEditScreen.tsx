import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Redirect, useLocation, useSearch } from 'wouter';
import { Camera, Plus, Sparkle, UtensilsCrossed, X } from 'lucide-react';
import { z } from 'zod';
import {
  DISH_GRAMS,
  entryDay,
  mealTypeAt,
  round1,
  scaleItem,
  type MealInput,
  type MealItemInput,
  type DayChoice,
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
import { Field } from '../../ui/Field/Field';
import { DishRow } from '../../ui/DishRow/DishRow';
import { DishSheet } from '../../ui/DishSheet/DishSheet';
import { HistoryHint } from '../../ui/HistoryHint/HistoryHint';
import {
  ManualDishSheet,
  type ManualDish,
} from '../../ui/ManualDishSheet/ManualDishSheet';
import { MealTypeSegment } from '../../ui/MealTypeSegment/MealTypeSegment';
import { NavBar } from '../../ui/NavBar/NavBar';
import { OfflineBar, useOnline } from '../../ui/OfflineBar/OfflineBar';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Segment } from '../../ui/Segment/Segment';
import { useToast } from '../../ui/Toast/Toast';
import { diaryDay, localToday } from '../diary/day';
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
  source: 'ai' | 'manual' | 'history';
  /** Null while the weight field is invalid (AC-3.4). */
  grams: number | null;
  /** Last valid weight: the numbers stay on it while the field is invalid. */
  shown: number;
  /** Weight or name edited: the confidence badge goes (AC-2.9). */
  edited: boolean;
  /** A similar dish from the history: the hint under the row (4.3). */
  previous?: Previous;
};

const photoSchema = z.object({ photoId: z.string() });
const previousSchema = z.array(
  z
    .object({
      mealId: z.number(),
      eatenAt: z.string(),
      grams: z.number(),
      kcal: z.number(),
      proteinG: z.number(),
      fatG: z.number(),
      carbsG: z.number(),
    })
    .nullable(),
);
/** The fields of `PreviousDish` the hint uses. */
type Previous = NonNullable<z.infer<typeof previousSchema>[number]>;
/** Delay after a name typed by hand before looking it up (AC-11.6). */
export const LOOKUP_DELAY_MS = 300;

type Lookup = { id: string; name: string; kcalPer100?: number };
const lookupOf = (row: Row): Lookup => ({
  id: row.id,
  name: row.original.name,
  ...(row.original.grams > 0 && {
    kcalPer100: (row.original.kcal / row.original.grams) * 100,
  }),
});

/** Default time of a meal added to a past day (AC-2.12). */
const MEAL_TIME: Record<MealType, string> = {
  breakfast: '08:00',
  lunch: '13:00',
  dinner: '19:00',
  snack: '16:00',
};

/** East-positive offset of the device at `at`, as the API takes it. */
const offsetAt = (at: Date) => -at.getTimezoneOffset();

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
  /** A past day (`YYYY-MM-DD`) from «Add an entry for this day» (AC-2.11); none: now. */
  date?: string;
  /** The clock: read on open and again on Save, the time eaten (E-1.4). */
  now?: () => Date;
  /** Editing a saved meal: its own dishes are not «last time» (OCT-53 grooming). */
  mealId?: number;
};

/** Screen 4 (design OCT-16 §3, E.2): dishes, weights with live totals, meal type, save. */
export function MealEditScreen({
  dishes,
  manual,
  photoId,
  units,
  onSave,
  onClose,
  date,
  now = () => new Date(),
  mealId,
}: Props) {
  const { t, num, locale } = useT();
  const online = useOnline();
  const [opened] = useState(now);
  // 00:00-03:59: the two choices give different days, a late snack goes to yesterday (AC-0.1a).
  const late =
    !date &&
    entryDay(opened, offsetAt(opened), 'yesterday') !==
      entryDay(opened, offsetAt(opened), 'today');
  const [day, setDay] = useState<DayChoice>('yesterday');
  // The idempotency key lives as long as the screen: «Try again» resends the same meal (4.8).
  const [clientId] = useState(uuid);
  const [rows, setRows] = useState(() => dishes.map((d) => toRow(d)));
  const [mealType, setMealType] = useState<MealType>(() =>
    date ? 'lunch' : mealTypeAt(opened.getHours()),
  );
  // A past day: the time follows the meal type until edited by hand (AC-2.12).
  const [time, setTime] = useState<string | null>(null);
  const eatenTime = time ?? MEAL_TIME[mealType];
  const [hh, mm] = eatenTime.split(':').map(Number);
  const [y, m, d] = (date ?? '').split('-').map(Number);
  /** The time eaten on a past day, local. */
  const pastAt = () => new Date(y!, m! - 1, d, hh, mm);
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
  // Pending history lookups by key; a new one with the same key cancels the old (AC-11.6).
  const lookups = useRef(new Map<string, AbortController>());

  /** The hint is optional (AC-11.3): errors and offline show nothing. */
  function findPrevious(key: string, wanted: Lookup[], ms = 0) {
    lookups.current.get(key)?.abort();
    const ctl = new AbortController();
    lookups.current.set(key, ctl);
    const timer = setTimeout(() => {
      api('/api/dishes/previous', previousSchema, {
        method: 'POST',
        body: {
          dishes: wanted.map(({ name, kcalPer100 }) => ({ name, kcalPer100 })),
        },
        signal: ctl.signal,
      }).then(
        (found) =>
          setRows((rs) =>
            rs.map((r) => {
              const i = wanted.findIndex((w) => w.id === r.id);
              const prev = found[i];
              // A renamed row waits for its own answer.
              return prev &&
                prev.mealId !== mealId &&
                r.original.name === wanted[i]!.name
                ? { ...r, previous: prev }
                : r;
            }),
          ),
        () => {},
      );
    }, ms);
    ctl.signal.addEventListener('abort', () => clearTimeout(timer));
  }

  // One request for all recognized dishes, by the AI's kcal per 100 g.
  useEffect(() => {
    const pending = lookups.current;
    if (rows.length) findPrevious('ai', rows.slice(0, 20).map(lookupOf));
    return () => pending.forEach((c) => c.abort());
  }, []);

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
    const row = rows.find((r) => r.id === id);
    const renamed = !!row && name !== row.original.name;
    setRows((rs) =>
      rs.map((r) =>
        r.id === id
          ? {
              ...r,
              original: { ...r.original, name },
              grams,
              shown: grams,
              edited: r.edited || renamed || grams !== r.grams,
              previous: renamed ? undefined : r.previous,
            }
          : r,
      ),
    );
    if (row && renamed)
      findPrevious(
        id,
        [lookupOf({ ...row, original: { ...row.original, name } })],
        LOOKUP_DELAY_MS,
      );
  };

  const addManual = (dish: ManualDish) => {
    setAdding(false);
    const row = toRow(dish, 'manual');
    focusRow.current = row.id;
    setRows((rs) => [...rs, row]);
    findPrevious(row.id, [lookupOf(row)], LOOKUP_DELAY_MS);
  };

  const keepEstimate = (id: string) =>
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, previous: undefined } : r)),
    );

  // «Same as last time»: weight recalculation now starts from the previous values (AC-11.5).
  const applyPrevious = (row: Row, prev: Previous) => {
    const { grams, kcal, proteinG, fatG, carbsG } = prev;
    setRows((rs) =>
      rs.map((r) =>
        r.id === row.id
          ? {
              ...r,
              original: {
                name: r.original.name,
                grams,
                kcal,
                proteinG,
                fatG,
                carbsG,
              },
              source: 'history',
              grams,
              shown: grams,
              edited: false,
              previous: undefined,
            }
          : r,
      ),
    );
    toast({
      text: t('edit.history.applied'),
      ms: 5000,
      action: {
        label: t('common.undo'),
        onClick: () =>
          setRows((rs) => rs.map((r) => (r.id === row.id ? row : r))),
      },
    });
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
    const at = date ? pastAt() : now();
    try {
      await onSave(
        {
          clientId,
          eatenAt: at.toISOString(),
          tzOffsetMin: offsetAt(at),
          localDate: date ?? entryDay(at, offsetAt(at), day),
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

  const timeOf = (at: Date) =>
    new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(at);
  const dateOf = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  const yesterday = entryDay(opened, offsetAt(opened), 'yesterday');
  const title = date
    ? t('edit.title', {
        day: dateOf(date, { weekday: 'short', day: 'numeric', month: 'short' }),
        time: timeOf(pastAt()),
      })
    : t('edit.title', {
        day: t(late && day === 'yesterday' ? 'day.yesterday' : 'day.today'),
        time: timeOf(opened),
      });
  const busy = status === 'saving';
  const editingRow = rows.find((r) => r.id === editing);

  return (
    <div className="meal-edit">
      <OfflineBar variant={useBarVariant()} />
      <div className="meal-edit__window">
        <NavBar
          title={title}
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
            {late && (
              <div className="meal-edit__day">
                <Segment
                  label={t('edit.late.label')}
                  options={(['yesterday', 'today'] as const).map((v) => ({
                    value: v,
                    label: t(`edit.late.${v}`),
                  }))}
                  value={day}
                  onChange={setDay}
                />
                {day === 'yesterday' && (
                  <p className="meal-edit__note">
                    {t('edit.late.hint', {
                      time: timeOf(opened),
                      // Keep "14 November" on one line.
                      date: dateOf(yesterday, {
                        day: 'numeric',
                        month: 'long',
                      }).replace(' ', '\u00a0'),
                    })}
                  </p>
                )}
              </div>
            )}
            {date && (
              <Field
                label={t('edit.time')}
                type="time"
                required
                value={eatenTime}
                onChange={(e) => setTime(e.target.value || null)}
              />
            )}
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
                      {row.previous && (
                        <HistoryHint
                          eatenAt={row.previous.eatenAt}
                          grams={row.previous.grams}
                          kcal={row.previous.kcal}
                          units={units}
                          onApply={() => applyPrevious(row, row.previous!)}
                          onKeep={() => keepEstimate(row.id)}
                        />
                      )}
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
  const params = new URLSearchParams(search);
  const photoId = params.get('photo') ?? undefined;
  // Checked like the diary's address: a real past day, else today (AC-2.3).
  const today = localToday();
  const day = diaryDay(params.get('date') ?? today, today);
  const date = day === today ? undefined : day;
  const [state] = useState(() => history.state as MealEditState | null);
  if (!state && photoId)
    return <Redirect to={`${MEAL_NEW_PATH}?${search}`} replace />;
  return (
    <MealEditScreen
      dishes={state && 'dishes' in state ? state.dishes : []}
      manual={state && 'manual' in state ? state.manual : undefined}
      photoId={photoId}
      date={date}
      units={settings?.units ?? user?.units ?? 'metric'}
      onSave={async (input, photo) => {
        await createMeal(db, input, photo);
        if (date) return navigate(`/diary/${date}`, { replace: true });
        navigate('/', {
          replace: true,
          state: { saved: input.clientId } satisfies TodayState,
        });
      }}
      onClose={() => navigate('/')}
    />
  );
}
