import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  amountGrams,
  amountModes,
  defaultAmount,
  packPrefsSchema,
  round1,
  type Amount,
  type AmountMode,
  type PackPrefs,
  type Product,
  type Units,
} from '@oct/shared';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import { Button } from '../Button/Button';
import { Field } from '../Field/Field';
import { parseDecimal } from '../FormList/FormList';
import { Segment } from '../Segment/Segment';
import { usePressRepeat } from '../usePressRepeat';
import { useWeight } from '../weightUnits';
import { WeightStepper } from '../WeightStepper/WeightStepper';
import { STEP, isLast, pickerModes, stepAmount, toMode } from './amount';
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
  const w = useWeight(units, per);
  const weight = w.text;
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

/** Typed package data: weight and pieces, without the amount. */
export type Pack = Omit<PackPrefs, 'amount'>;

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
  /** A valid package weight or piece count typed (AC-4.1, AC-4.2); `product` already has it. */
  onPack: (pack: Pack) => void;
};

/** Open questions: the package weight, the piece count; `piece`: asked for «Pieces». */
type Ask = { packG: boolean; pieces: boolean; piece: boolean };

/** «How much you ate» (ADR-0037 §5): Package · Servings · Pieces · Grams, as the recipe portion sheet. */
export function AmountPicker({
  product: p,
  amount,
  grams,
  units,
  label,
  onChange,
  onPack,
}: Props) {
  const { t } = useT();
  const text = useAmountText(units, p.per);
  const w = useWeight(units, p.per);
  const modes = pickerModes(p);
  const set = (a: Amount) => onChange(a, amountGrams(p, a));
  const [ask, setAsk] = useState<Ask | null>(null);
  // null: not typed yet, so no error before the first key.
  const [packText, setPackText] = useState<string | null>(null);
  const [piecesText, setPiecesText] = useState<string | null>(null);
  // The product and amount when the form opened: an invalid entry falls back to them.
  const [base, setBase] = useState({ p, amount });
  const open = (next: Ask) => {
    setAsk(next);
    setBase({ p, amount });
    // «Change» starts from the known weight in the user's units (E-7.2).
    setPackText(next.packG && p.packG ? String(round1(w.show(p.packG))) : null);
    setPiecesText(null);
  };
  // Whole grams before the check, so 1–5000 g holds for ounces too (E-7.6).
  const packG = (s: string | null) => {
    const n = s === null ? null : parseDecimal(s.trim());
    const g = n === null ? NaN : Math.round(w.toG(n));
    return packPrefsSchema.shape.packG.safeParse(g).success ? g : null;
  };
  const pieces = (s: string | null) => {
    const n = s === null ? null : parseDecimal(s.trim());
    return n !== null && packPrefsSchema.shape.pieces.safeParse(n).success
      ? n
      : null;
  };
  /** The amount once the package is known: «Whole» or the piece asked for (3.2, 3.3). */
  const land = (next: Product) => {
    const ms = amountModes(next);
    const a: Amount = ask?.piece
      ? ms.includes('piece')
        ? { mode: 'piece', value: 1 }
        : amount
      : amount.mode !== 'weight' && ms.includes(amount.mode)
        ? amount
        : ms.includes('pack')
          ? { mode: 'pack', value: 1 }
          : defaultAmount(next);
    onChange(a, amountGrams(next, a));
  };
  /** An invalid entry: back to what the product had, so «Done» never keeps a half-typed value. */
  const revert = (k: keyof Pack) => {
    const was = base.p[k] ?? undefined;
    onPack({ [k]: was });
    onChange(base.amount, amountGrams({ ...p, [k]: was }, base.amount));
  };
  const typePack = (s: string) => {
    setPackText(s);
    const g = packG(s);
    if (g === null) return revert('packG');
    onPack({ packG: g });
    land({ ...p, packG: g });
  };
  const typePieces = (s: string) => {
    setPiecesText(s);
    const n = pieces(s);
    if (n === null) return revert('pieces');
    onPack({ pieces: n });
    if (p.packG) land({ ...p, pieces: n });
  };
  const press = usePressRepeat((dir) => {
    const next = stepAmount(p, amount, dir);
    // At an edge the button disables and may never get pointerup.
    if (next.value === amount.value) return press.stop();
    set(next);
  });
  const { mode, value } = amount;
  const shown = mode === 'weight' ? null : text.big(p, amount);
  const step = mode === 'weight' ? '' : t(`edit.amount.step.${mode}`);
  // «Pieces» picked with the count unknown: the question stands in for the stepper.
  const selected = ask?.piece ? 'piece' : mode;
  const body = !ask || (mode !== 'weight' && mode === selected);

  return (
    <div className="amount">
      <div className="amount__head">
        <span className="amount__label">{t('edit.amount.label')}</span>
        <Segment
          label={t('edit.amount.modes')}
          options={modes.map((m) => ({ value: m, label: text.modeName(m) }))}
          value={selected}
          onChange={(m) => {
            if (m === 'piece' && !amountModes(p).includes('piece'))
              return open({ packG: !p.packG, pieces: !p.pieces, piece: true });
            setAsk(null);
            set(toMode(p, m, grams ?? amountGrams(p, amount)));
          }}
        />
      </div>
      {ask?.packG && (
        <Field
          label={t('edit.dish.pack.weight')}
          value={packText ?? ''}
          inputMode={w.us ? 'decimal' : 'numeric'}
          suffix={w.u}
          hint={t('edit.dish.pack.weight_hint')}
          error={
            packText !== null && packG(packText) === null
              ? t('edit.dish.pack.err.weight')
              : undefined
          }
          autoFocus
          onChange={(e) => typePack(e.target.value)}
        />
      )}
      {ask?.pieces && (
        <Field
          label={t('edit.dish.pack.pieces')}
          value={piecesText ?? ''}
          inputMode="numeric"
          suffix={t('edit.amount.pcs')}
          placeholder={t('edit.dish.pack.pieces_ph')}
          hint={
            p.packG
              ? t('edit.dish.pack.pieces_hint', { w: text.weight(p.packG) })
              : undefined
          }
          error={
            piecesText !== null && pieces(piecesText) === null
              ? t('edit.dish.pack.err.pieces')
              : undefined
          }
          autoFocus={!ask.packG}
          onChange={(e) => typePieces(e.target.value)}
        />
      )}
      {!body ? null : mode === 'weight' ? (
        <div className="portion__grams">
          <WeightStepper
            grams={grams}
            units={units}
            unit={p.per}
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
      {!ask && (
        <div className="amount__package">
          <p className="tabular-nums">
            {p.packG
              ? [
                  t('edit.amount.package', { w: text.weight(p.packG) }),
                  p.pieces && t('edit.amount.pieces', { n: p.pieces }),
                  p.servingG &&
                    t('edit.amount.package_serving', {
                      w: text.weight(p.servingG),
                    }),
                ]
                  .filter(Boolean)
                  .join(' · ')
              : t('edit.dish.pack.unknown')}
          </p>
          <Button
            small
            variant={p.packG ? 'plain' : 'tonal'}
            onClick={() => open({ packG: true, pieces: false, piece: false })}
          >
            {t(p.packG ? 'edit.dish.pack.change' : 'edit.dish.pack.add')}
          </Button>
        </div>
      )}
    </div>
  );
}
