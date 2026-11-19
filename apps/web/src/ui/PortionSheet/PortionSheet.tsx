import { useState, type MouseEvent } from 'react';
import { Clock, Minus, Plus } from 'lucide-react';
import {
  DISH_GRAMS,
  mealTypeAt,
  recipePortion,
  servingG,
  type MealItemInput,
  type MealType,
  type Recipe,
  type Units,
} from '@oct/shared';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { MealTypeSegment } from '../MealTypeSegment/MealTypeSegment';
import { Segment } from '../Segment/Segment';
import { Sheet } from '../Sheet/Sheet';
import { usePressRepeat } from '../usePressRepeat';
import { useWeight } from '../weightUnits';
import { WeightStepper } from '../WeightStepper/WeightStepper';
import '../WeightStepper/WeightStepper.css';
import './PortionSheet.css';

const CHIPS = [
  [0.5, '½'],
  [1, '1'],
  [1.5, '1½'],
  [2, '2'],
] as const;

/** `HH:mm` of `at` on the device clock, as `<input type="time">` takes it. */
const hhmm = (at: Date) =>
  `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;

/** Today at `time` on the device clock; a future time is pulled back to `now` (AC-2.9). */
export function todayAt(time: string, now: Date) {
  const [h, m] = time.split(':').map(Number);
  const at = new Date(now);
  at.setHours(h!, m!, 0, 0);
  return at > now ? now : at;
}

/** ±½ serving from `grams`: to the next half on the way, within 1–5000 g. */
export function stepServings(grams: number, serving: number, dir: 1 | -1) {
  // Grams are whole, so a typed weight is rarely an exact half: round off the noise first.
  const halves = Math.round((grams / serving) * 200) / 100;
  const next = (dir > 0 ? Math.floor(halves) + 1 : Math.ceil(halves) - 1) / 2;
  const max = Math.floor((DISH_GRAMS.max / serving) * 2) / 2;
  return Math.round(Math.min(max, Math.max(0.5, next)) * serving);
}

type Props = {
  open: boolean;
  recipe: Recipe;
  onClose: () => void;
  /**
   * The dish as a recipe portion. With `log` the sheet also picks the meal and time
   * («Log to dinner», from the recipe card); without it, it is «Add» to a meal being edited.
   */
  onAdd: (item: MealItemInput, when?: { mealType: MealType; at: Date }) => void;
  log?: boolean;
  /** Weights in grams or ounces (AC-2.6); the portion is grams either way. */
  units?: Units;
  /** Opened at; stories and tests pin it. */
  now?: Date;
};

/** A serving of a recipe (OCT-160 §5, 3.1–3.3): servings or grams, live kcal and macros. */
export function PortionSheet({
  open,
  recipe,
  onClose,
  onAdd,
  log = false,
  units = 'metric',
  now = new Date(),
}: Props) {
  const { t, num, locale } = useT();
  const w = useWeight(units);
  const serving = servingG(recipe);
  const [mode, setMode] = useState<'servings' | 'grams'>(
    serving ? 'servings' : 'grams',
  );
  const [grams, setGrams] = useState<number | null>(
    serving ? Math.round(serving) : 100,
  );
  const [mealType, setMealType] = useState<MealType>(
    mealTypeAt(now.getHours()),
  );
  const [time, setTime] = useState(() => hhmm(now));
  const press = usePressRepeat((dir) =>
    setGrams((g) =>
      serving ? stepServings(g ?? Math.round(serving), serving, dir) : g,
    ),
  );

  const item = grams === null ? null : recipePortion(recipe, grams);
  const servings =
    serving && grams !== null
      ? new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
          grams / serving,
        )
      : null;
  const openPicker = (event: MouseEvent<HTMLInputElement>) => {
    try {
      event.currentTarget.showPicker(); // desktop Chrome: a click alone only focuses
    } catch {
      // No showPicker, or no user activation: the native behaviour stays.
    }
  };

  return (
    <Sheet
      open={open}
      title={recipe.name}
      onClose={onClose}
      footer={
        <Button
          disabled={!item}
          onClick={() =>
            item &&
            onAdd(
              item,
              log ? { mealType, at: todayAt(time, new Date()) } : undefined,
            )
          }
        >
          {log ? t(`portion.log_to.${mealType}`) : t('portion.add')}
        </Button>
      }
    >
      <div className="portion">
        {serving && (
          <Segment
            label={t('portion.mode')}
            options={[
              { value: 'servings', label: t('portion.servings') },
              {
                value: 'grams',
                label: t(w.us ? 'portion.ounces' : 'portion.grams'),
              },
            ]}
            value={mode}
            onChange={setMode}
          />
        )}
        {mode === 'servings' && serving ? (
          <div className="stepper__row portion__servings">
            <button
              type="button"
              className="stepper__button"
              aria-label={t('portion.less')}
              disabled={grams !== null && grams <= Math.round(serving / 2)}
              {...press.bind(-1)}
            >
              <Minus aria-hidden="true" />
            </button>
            <span className="portion__count tabular-nums" aria-live="polite">
              {t('portion.count', { n: servings ?? '—' })}
            </span>
            <button
              type="button"
              className="stepper__button"
              aria-label={t('portion.more')}
              {...press.bind(1)}
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="portion__grams">
            <WeightStepper
              grams={grams}
              units={units}
              label={t('edit.weight.label', { dish: recipe.name })}
              onChange={setGrams}
            />
          </div>
        )}
        {serving && (
          <div className="portion__chips">
            {CHIPS.map(([n, label]) => (
              <button
                key={n}
                type="button"
                className="portion__chip tabular-nums"
                aria-pressed={grams === Math.round(n * serving)}
                aria-label={t('portion.count', { n: label })}
                onClick={() => setGrams(Math.round(n * serving))}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <p className="portion__total tabular-nums">
          {item ? (
            <>
              <b>{t('meal.kcal', { n: num(item.kcal) })}</b>
              {' · '}
              {t('edit.macros', {
                p: num(item.proteinG),
                f: num(item.fatG),
                c: num(item.carbsG),
              })}
              {mode === 'servings' && ` · ${w.fmt(item.grams)}\u00a0${w.u}`}
            </>
          ) : (
            '—'
          )}
        </p>
        {log && (
          <>
            <MealTypeSegment value={mealType} onChange={setMealType} />
            {/* The time in the app's language; the native picker covers it transparently. */}
            <label className="portion__when">
              <Clock aria-hidden="true" />
              <span aria-hidden="true">
                {t('portion.today', {
                  time: new Intl.DateTimeFormat(locale, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                    .format(todayAt(time, now))
                    .replace(/ /g, ' '),
                })}
              </span>
              <input
                type="time"
                aria-label={t('edit.time')}
                required
                value={time}
                onClick={openPicker}
                // A cleared field keeps the value.
                onChange={(e) => e.target.value && setTime(e.target.value)}
              />
            </label>
          </>
        )}
      </div>
    </Sheet>
  );
}
