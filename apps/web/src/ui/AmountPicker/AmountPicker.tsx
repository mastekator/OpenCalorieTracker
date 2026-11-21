import { Minus, Plus } from 'lucide-react';
import {
  amountGrams,
  amountModes,
  type Amount,
  type AmountMode,
  type Product,
  type Units,
} from '@oct/shared';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import { Segment } from '../Segment/Segment';
import { usePressRepeat } from '../usePressRepeat';
import { useWeight } from '../weightUnits';
import { WeightStepper } from '../WeightStepper/WeightStepper';
import { STEP, isLast, stepAmount, toMode } from './amount';
import '../WeightStepper/WeightStepper.css';
import '../PortionSheet/PortionSheet.css';
import './AmountPicker.css';

const GLYPHS: [number, string][] = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];

const CHIPS = [0.25, 1 / 3, 0.5, 0.75, 1];

const same = (a: number, b: number) => Math.abs(a - b) < 0.001;

/** Texts of an amount: «½», «½ pack · 100 g», «2 of 12 · 33 g»; ml as the product's `per`. */
export function useAmountText(units: Units, per: Product['per']) {
  const { t, locale } = useT();
  const w = useWeight(units);
  const unit = per === 'ml' && !w.us ? t('unit.ml') : w.u;
  const weight = (g: number) => `${w.fmt(g)}\u00a0${unit}`;
  const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  /** 1½, ¼, ⅓; other values as decimals. */
  const share = (v: number) => {
    const whole = Math.floor(v + 0.001);
    const glyph = GLYPHS.find(([x]) => same(v - whole, x))?.[1];
    if (glyph) return `${whole ? decimal.format(whole) : ''}${glyph}`;
    return decimal.format(v);
  };
  /** The big number and the line under it in the sheet. */
  const big = (p: Product, a: Amount) => {
    const g = weight(amountGrams(p, a));
    if (a.mode === 'pack' || a.mode === 'serving') {
      const word =
        a.value < 1
          ? t(`edit.amount.${a.mode}_part`)
          : t(`edit.amount.${a.mode}_n`, { count: a.value });
      return { n: share(a.value), sub: `${word} · ${g}` };
    }
    const of =
      a.value <= p.pieces!
        ? t('edit.amount.of', { total: decimal.format(p.pieces!) })
        : t('edit.amount.pcs');
    return { n: decimal.format(a.value), sub: `${of} · ${g}` };
  };
  /** The dish row's stepper: «1 pack · 120 g»; grams alone in the weight mode. */
  const row = (p: Product, a: Amount) => {
    const g = weight(amountGrams(p, a));
    if (a.mode === 'weight') return g;
    const what =
      a.mode === 'piece'
        ? a.value <= p.pieces!
          ? t('edit.amount.row.of', {
              n: decimal.format(a.value),
              total: decimal.format(p.pieces!),
            })
          : t('edit.amount.row.pcs', { n: decimal.format(a.value) })
        : // «½ pack», not «½ packs»: a share counts as one.
          t(`edit.amount.row.${a.mode}`, {
            n: share(a.value),
            count: Math.max(1, a.value),
          });
    return `${what} · ${g}`;
  };
  const modeName = (m: AmountMode) =>
    m !== 'weight'
      ? t(`edit.amount.${m}`)
      : w.us
        ? t('edit.amount.ounces')
        : t(per === 'ml' ? 'edit.amount.ml' : 'edit.amount.grams');
  return { weight, share, big, row, modeName };
}

type Props = {
  product: Product;
  amount: Amount;
  /** Current weight; null while the grams field is invalid. */
  grams: number | null;
  units: Units;
  /** Accessible name of the grams field, e.g. «Weight of Oat cookies». */
  label: string;
  /** Every change: the amount and its grams (null: invalid grams typed). */
  onChange: (amount: Amount, grams: number | null) => void;
};

/** «How much you ate» (ADR-0037 §5): Package · Servings · Pieces · Grams, as the recipe portion sheet. */
export function AmountPicker({
  product: p,
  amount,
  grams,
  units,
  label,
  onChange,
}: Props) {
  const { t } = useT();
  const text = useAmountText(units, p.per);
  const modes = amountModes(p);
  const set = (a: Amount) => onChange(a, amountGrams(p, a));
  const press = usePressRepeat((dir) => {
    const next = stepAmount(p, amount, dir);
    // At an edge the button disables and may never get pointerup.
    if (next.value === amount.value) return press.stop();
    set(next);
  });
  const { mode, value } = amount;
  const shown = mode === 'weight' ? null : text.big(p, amount);
  const step = mode === 'weight' ? '' : t(`edit.amount.step.${mode}`);

  return (
    <div className="amount">
      <div className="amount__head">
        <span className="amount__label">{t('edit.amount.label')}</span>
        <Segment
          label={t('edit.amount.modes')}
          options={modes.map((m) => ({ value: m, label: text.modeName(m) }))}
          value={mode}
          onChange={(m) => set(toMode(p, m, grams ?? amountGrams(p, amount)))}
        />
      </div>
      {mode === 'weight' ? (
        <div className="portion__grams">
          <WeightStepper
            grams={grams}
            units={units}
            label={label}
            onChange={(g) => onChange({ mode, value: g ?? value }, g)}
          />
        </div>
      ) : (
        <>
          <div className="stepper__row portion__servings">
            <button
              type="button"
              className="stepper__button"
              aria-label={t('edit.amount.less', { step })}
              disabled={value <= STEP[mode]}
              {...press.bind(-1)}
            >
              <Minus aria-hidden="true" />
            </button>
            <span className="amount__value tabular-nums" aria-live="polite">
              <b className="portion__count">{shown!.n}</b>
              <small>{shown!.sub}</small>
            </span>
            <button
              type="button"
              className="stepper__button"
              aria-label={t('edit.amount.more', { step })}
              {...press.bind(1)}
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
          {mode === 'pack' && (
            <div
              className="portion__chips"
              role="group"
              aria-label={t('edit.amount.quick')}
            >
              {CHIPS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="portion__chip tabular-nums"
                  aria-pressed={same(value, n)}
                  onClick={() => set({ mode, value: n })}
                >
                  {n === 1 ? t('edit.amount.whole') : text.share(n)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {isLast(p, amount) && (
        <span className="amount__last">
          <Badge>{t('edit.amount.last')}</Badge>
        </span>
      )}
      {p.packG && (
        <p className="amount__package tabular-nums">
          {[
            t('edit.amount.package', { w: text.weight(p.packG) }),
            p.pieces && t('edit.amount.pieces', { n: p.pieces }),
            p.servingG &&
              t('edit.amount.package_serving', {
                w: text.weight(p.servingG),
              }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </div>
  );
}
