import { useEffect, useRef, useState } from 'react';
import { Redirect, useLocation, useSearch } from 'wouter';
import { Sparkle, X } from 'lucide-react';
import {
  DISH_GRAMS,
  mealTypeAt,
  round1,
  scaleItem,
  type MealInput,
  type MealItemInput,
  type MealType,
  type RecognizedDish,
  type Units,
  uuid,
} from '@oct/shared';
import { useDb, useSettings } from '../../data/DataContext';
import { createMeal } from '../../data/outbox';
import { useT } from '../../i18n';
import { useBarVariant } from '../../app/connection';
import { useSession } from '../../app/SessionContext';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { DishRow } from '../../ui/DishRow/DishRow';
import { MealTypeSegment } from '../../ui/MealTypeSegment/MealTypeSegment';
import { NavBar } from '../../ui/NavBar/NavBar';
import { OfflineBar, useOnline } from '../../ui/OfflineBar/OfflineBar';
import type { TodayState } from '../diary/TodayScreen';
import { MEAL_NEW_PATH } from './CaptureContext';
import type { MealEditState } from './RecognitionScreen';
import './MealEditScreen.css';

type Row = {
  /** As recognized: every recalculation starts from here (AC-3.2). */
  original: RecognizedDish;
  /** Null while the weight field is invalid (AC-3.4). */
  grams: number | null;
  /** Last valid weight: the numbers stay on it while the field is invalid. */
  shown: number;
  /** Weight or name edited: the confidence badge goes (AC-2.9). */
  edited: boolean;
};

const inRange = (g: number) => g >= DISH_GRAMS.min && g <= DISH_GRAMS.max;

function toRow(original: RecognizedDish): Row {
  // AI grams may carry any decimals; the API takes one (mealItemInputSchema).
  const g = round1(original.grams);
  return {
    original,
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
    source: 'ai',
    ...(!row.edited && { confidence }),
  };
};

type Props = {
  /** Recognized dishes; empty for manual entry (OCT-60). */
  dishes: RecognizedDish[];
  photoId?: string;
  units: Units;
  /** Writes the meal; a rejection keeps the edits and offers «Try again» (E-4.3). */
  onSave: (input: MealInput) => Promise<void>;
  onClose: () => void;
  /** When the screen opened; also the time eaten. */
  now?: Date;
};

/** Screen 4 (design OCT-16 §3, E.2): dishes, weights with live totals, meal type, save. */
export function MealEditScreen({
  dishes,
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
  const [rows, setRows] = useState(() => dishes.map(toRow));
  const [mealType, setMealType] = useState<MealType>(() =>
    mealTypeAt(opened.getHours()),
  );
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const saving = useRef(false);

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

  async function save() {
    if (saving.current || !valid) return; // a second tap sends nothing (E-4.2)
    saving.current = true;
    setStatus('saving');
    try {
      await onSave({
        clientId,
        eatenAt: opened.toISOString(),
        tzOffsetMin: -opened.getTimezoneOffset(),
        localDate: opened.toLocaleDateString('sv'),
        mealType,
        ...(photoId && { photoId }),
        items,
      });
    } catch {
      saving.current = false;
      setStatus('error');
    }
  }

  const keys = useRef({ save, onClose });
  keys.current = { save, onClose };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void keys.current.save();
      } else if (e.key === 'Escape' && !e.defaultPrevented) {
        // shortcut: closes at once; the «Save this meal?» confirm (4.7) is OCT-59.
        keys.current.onClose();
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

  return (
    <div className="meal-edit">
      <OfflineBar variant={useBarVariant()} />
      <div className="meal-edit__window">
        <NavBar
          title={t('edit.title', { day: t('day.today'), time })}
          action={{ icon: X, label: t('common.close'), onClick: onClose }}
        />
        {status === 'error' && (
          <div className="meal-edit__error">
            <Banner tone="danger" title={t('edit.save_err.title')}>
              {t('edit.save_err.body')}
            </Banner>
          </div>
        )}
        <div className="meal-edit__body">
          <aside
            className={`meal-edit__summary${photoId ? ' meal-edit__summary--photo' : ''}`}
          >
            {photoId && (
              <img
                className="meal-edit__thumb"
                src={`/api/photos/${encodeURIComponent(photoId)}?size=preview`}
                alt=""
              />
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
            {rows.length > 0 && (
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
                    <li key={i}>
                      <DishRow
                        dish={{
                          ...item,
                          grams: row.grams,
                          confidence: item.confidence,
                        }}
                        units={units}
                        onGramsChange={(g) => setGrams(i, g)}
                        // shortcut: the «Dish» sheet (4.4) comes with OCT-59.
                        onEdit={() => {}}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="meal-edit__empty">{t('edit.empty_manual')}</p>
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
      photoId={photoId}
      units={settings?.units ?? user?.units ?? 'metric'}
      onSave={async (input) => {
        await createMeal(db, input);
        navigate('/', {
          replace: true,
          state: { saved: input.clientId } satisfies TodayState,
        });
      }}
      onClose={() => navigate('/')}
    />
  );
}
