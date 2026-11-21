import {
  DISH_GRAMS,
  amountGrams,
  amountModes,
  type Amount,
  type AmountMode,
  type Product,
} from '@oct/shared';

/** ± in each mode: ¼ package, ½ serving, 1 piece (ADR-0037 §5). */
export const STEP = { pack: 0.25, serving: 0.5, piece: 1 } as const;
type CountMode = keyof typeof STEP;

/** At most 10 packages (AC-3.2); servings and pieces up to the dish limit. */
function maxOf(p: Product, mode: CountMode) {
  if (mode === 'pack') return 10;
  const unit = amountGrams(p, { mode, value: 1 });
  return Math.max(
    STEP[mode],
    Math.floor(DISH_GRAMS.max / unit / STEP[mode]) * STEP[mode],
  );
}

/** One step from `a` in its mode, to the next step on the grid (⅓ + ¼ → ½); never under one step. */
export function stepAmount(p: Product, a: Amount, dir: 1 | -1): Amount {
  if (a.mode === 'weight') return a;
  const step = STEP[a.mode];
  // Round off float noise first, so 0.75 / 0.25 is exactly 3.
  const steps = Math.round((a.value / step) * 1000) / 1000;
  const next = (dir > 0 ? Math.floor(steps) + 1 : Math.ceil(steps) - 1) * step;
  return {
    mode: a.mode,
    value: Math.max(step, Math.min(maxOf(p, a.mode), next)),
  };
}

/** The same grams in another mode, rounded to its step (e.g. 100 g of a 200 g pack → ½). */
export function toMode(p: Product, mode: AmountMode, grams: number): Amount {
  if (mode === 'weight') return { mode, value: Math.round(grams) };
  const step = STEP[mode];
  const units = grams / amountGrams(p, { mode, value: 1 });
  return {
    mode,
    value: Math.max(
      step,
      Math.min(maxOf(p, mode), Math.round(units / step) * step),
    ),
  };
}

/** The product allows more than grams: the row counts in shares. */
export const hasShares = (p: Product | undefined): p is Product =>
  !!p && amountModes(p).length > 1;

/** The sheet's modes: «Pieces» too while the count is unknown, to ask it (OCT-380 3.3). */
export function pickerModes(p: Product): AmountMode[] {
  const modes = amountModes(p);
  if (modes.includes('piece') || p.pieces === 1) return modes;
  return [...modes.slice(0, -1), 'piece', 'weight'];
}

/** The pick remembered for the code: «same as last time» (OCT-380 1.2). */
export const isLast = (p: Product, a: Amount) =>
  !!p.last &&
  p.last.mode === a.mode &&
  Math.abs(p.last.value - a.value) < 0.001;
