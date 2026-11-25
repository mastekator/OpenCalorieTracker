import { useId, useState, type KeyboardEvent } from 'react';
import { CircleAlert, Info, Minus, Plus, Sparkles } from 'lucide-react';
import {
  DISH_GRAMS,
  edibleGrams,
  grossKind,
  scaleItem,
  type Nutrients,
  type Units,
} from '@oct/shared';
import {
  edibleShare,
  nudgePct,
  type RowEdible,
} from '../../features/meals/refine';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { Segment } from '../Segment/Segment';
import { usePressRepeat } from '../usePressRepeat';
import { useWeight } from '../weightUnits';
import { WeightStepper } from '../WeightStepper/WeightStepper';
import '../AmountPicker/AmountPicker.css';
import '../DishSourceBlock/DishSourceBlock.css';
import '../PortionSheet/PortionSheet.css';
import './EdibleBlock.css';

const QUICK = [90, 75, 50, 25];

/** Edible grams of the share, or null out of the dish range (nothing to save). */
export const edibleGramsOf = (e: RowEdible) => {
  const g = edibleGrams(e.grossG, edibleShare(e));
  return g >= DISH_GRAMS.min && g <= DISH_GRAMS.max ? g : null;
};

/** A typed share: a whole number 10–100, or null. */
const pctOf = (s: string) => {
  const n = Number(s.trim());
  return s.trim() !== '' && Number.isInteger(n) && n >= 10 && n <= 100
    ? n
    : null;
};

type Props = {
  edible: RowEdible;
  /** The dish name, for «Saved for “{name}”». */
  name: string;
  units: Units;
  /** Every change: the share and its edible grams, null while the gross or the result is invalid. */
  onChange: (edible: RowEdible, grams: number | null) => void;
};

/**
 * Dish sheet, a dish weighed with its skin (OCT-420 2.1–2.4): «Peeled · Whole», the gross weight
 * and the edible result with «Change %» (10–100 %, steps of 5).
 */
export function EdibleBlock({ edible, name, units, onChange }: Props) {
  const { t, num } = useT();
  const w = useWeight(units);
  const errorId = useId();
  const [editing, setEditing] = useState(false);
  // Typed text of the share; null: the share itself.
  const [typed, setTyped] = useState<string | null>(null);
  const kind = grossKind(edible.key);
  const pct = edibleShare(edible);
  const net = edibleGrams(edible.grossG, pct);

  const put = (e: RowEdible) => onChange(e, edibleGramsOf(e));
  // «Peeled» with a share: the user's choice, remembered on save (ADR-0039 §5).
  const share = (p: number) =>
    put({ ...edible, pct: p, chosen: true, whole: undefined });
  const nudge = (dir: 1 | -1) => {
    const next = nudgePct(edible.pct, dir);
    setTyped(null);
    // At an edge the button disables and may never get pointerup.
    if (next === edible.pct) return press.stop();
    share(next);
  };
  const press = usePressRepeat(nudge);

  const err = typed !== null && pctOf(typed) === null;

  const onKeyDown = (e: KeyboardEvent) => {
    const dir = { ArrowUp: 1, ArrowDown: -1 }[e.key] as 1 | -1 | undefined;
    if (!dir) return;
    e.preventDefault();
    nudge(dir);
  };

  return (
    <div className="edible">
      <div className="amount__head">
        <span className="amount__label">{t('edit.edible.how')}</span>
        <Segment
          label={t('edit.edible.how')}
          options={(['peeled', 'whole'] as const).map((m) => ({
            value: m,
            label: t(`edit.edible.mode.${m}`),
          }))}
          value={edible.whole ? 'whole' : 'peeled'}
          onChange={(m) => {
            setEditing(false);
            setTyped(null);
            if (m === 'whole') put({ ...edible, whole: true, chosen: true });
            else share(edible.pct);
          }}
        />
      </div>
      <div className="amount__head">
        <span className="amount__label">
          {edible.whole
            ? t('edit.edible.weight')
            : t('edit.edible.gross_label', {
                kind: t(`edit.edible.gross_kind.${kind}`),
              })}
        </span>
        <div className="portion__grams">
          <WeightStepper
            grams={edible.grossG}
            units={units}
            label={
              edible.whole
                ? t('edit.edible.weight')
                : t('edit.edible.gross_label', {
                    kind: t(`edit.edible.gross_kind.${kind}`),
                  })
            }
            onChange={(g) =>
              g === null
                ? onChange(edible, null)
                : put({ ...edible, grossG: g })
            }
          />
        </div>
      </div>
      {editing ? (
        <div className="amount__head">
          <span className="amount__label">{t('edit.edible.pct_label')}</span>
          <div className={`stepper${err ? ' stepper--error' : ''}`}>
            <div className="stepper__row portion__grams">
              <button
                type="button"
                className="stepper__button"
                aria-label={t('edit.edible.less')}
                disabled={edible.pct <= 10}
                {...press.bind(-1)}
              >
                <Minus aria-hidden="true" />
              </button>
              <label className="stepper__box">
                <input
                  className="stepper__input tabular-nums"
                  inputMode="numeric"
                  aria-label={t('edit.edible.pct_label')}
                  aria-invalid={err}
                  aria-describedby={err ? errorId : undefined}
                  value={typed ?? String(edible.pct)}
                  onChange={(e) => {
                    setTyped(e.target.value);
                    const n = pctOf(e.target.value);
                    // Out of range: the result keeps the previous share (OCT-420 2.4).
                    if (n !== null) share(n);
                  }}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={onKeyDown}
                />
                <span className="stepper__unit" aria-hidden="true">
                  %
                </span>
              </label>
              <button
                type="button"
                className="stepper__button"
                aria-label={t('edit.edible.more')}
                disabled={edible.pct >= 100}
                {...press.bind(1)}
              >
                <Plus aria-hidden="true" />
              </button>
            </div>
            {err && (
              <p id={errorId} className="stepper__error">
                <CircleAlert aria-hidden="true" />
                {t('edit.edible.pct_err')}
              </p>
            )}
          </div>
          <p className="edible__note tabular-nums" aria-live="polite">
            {t('edit.edible.pct_edible', { net: w.text(net) })}
          </p>
          <div
            className="portion__chips"
            role="group"
            aria-label={t('edit.amount.quick')}
          >
            {QUICK.map((n) => (
              <button
                key={n}
                type="button"
                className="portion__chip tabular-nums"
                aria-pressed={edible.pct === n}
                onClick={() => {
                  setTyped(null);
                  share(n);
                }}
              >
                {t('edit.edible.pct', { n: num(n) })}
              </button>
            ))}
          </div>
          <p className="edible__note">{t('edit.edible.pct_hint', { name })}</p>
        </div>
      ) : (
        <div className="edible__result tabular-nums">
          <span className="edible__main">
            <span>{t('edit.edible.result')}</span>
            <b>{w.text(net)}</b>
            <span>
              {t('edit.edible.pct', { n: num(pct) })} ·{' '}
              <span
                className={
                  edible.chosen || edible.source === 'ref'
                    ? 'edible__source'
                    : undefined
                }
              >
                {edible.whole
                  ? t('edit.edible.whole_source')
                  : t(
                      `edit.edible.source_long.${edible.chosen ? 'user' : edible.source}`,
                    )}
              </span>
            </span>
          </span>
          {!edible.whole && (
            <Button
              variant="tonal"
              small
              aria-label={t('edit.edible.change_label', { pct: num(pct) })}
              onClick={() => setEditing(true)}
            >
              {t('edit.edible.change')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Where the share comes from, under the dish numbers (OCT-420 2.1); none for «Whole». */
export function EdibleSource({
  edible,
  original,
}: {
  edible: RowEdible;
  /** The dish values the sheet recalculates from: their per-100 g is the edible part's. */
  original: Nutrients & { grams: number };
}) {
  const { t, num } = useT();
  if (edible.whole) return null;
  const from = edible.chosen ? 'user' : edible.source;
  const per = scaleItem(original, 100);
  return (
    <section className="dish-source">
      <p className="dish-source__title">
        {from === 'ai' ? (
          <Sparkles aria-hidden="true" />
        ) : (
          <Info aria-hidden="true" />
        )}
        {t(`edit.edible.src.${from}`)}
      </p>
      <p className="tabular-nums">
        {t('edit.edible.waste', {
          pct: num(100 - edible.pct),
          what: t(`edit.edible.waste_kind.${grossKind(edible.key)}`),
        })}
      </p>
      <p className="tabular-nums">
        {t('edit.edible.per100', {
          kcal: t('meal.kcal', { n: num(per.kcal) }),
          macros: t('edit.macros', {
            p: num(per.proteinG),
            f: num(per.fatG),
            c: num(per.carbsG),
          }),
        })}
      </p>
    </section>
  );
}
