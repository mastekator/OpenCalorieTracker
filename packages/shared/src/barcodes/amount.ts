import { round1 } from '../units.js';
import type { Product } from './barcodes.js';

/** How much of a product was eaten (ADR-0037 §5). */
export type Amount = NonNullable<Product['last']>;
export type AmountMode = Amount['mode'];

/** The modes the product's data allows, in the switch order (AC-3.1). */
export function amountModes(p: Product): AmountMode[] {
  const modes: AmountMode[] = [];
  if (p.packG) modes.push('pack');
  // A serving as big as the package is the package (E-7.1).
  if (p.servingG && !(p.packG && p.servingG >= p.packG)) modes.push('serving');
  // One piece in the package would repeat «Package».
  if (p.packG && p.pieces && p.pieces > 1) modes.push('piece');
  modes.push('weight');
  return modes;
}

/** Last pick if still possible → the whole package → one serving → 100 (AC-5.2, AC-3.8). */
export function defaultAmount(p: Product): Amount {
  const modes = amountModes(p);
  if (p.last && modes.includes(p.last.mode)) return p.last;
  if (modes.includes('pack')) return { mode: 'pack', value: 1 };
  if (modes.includes('serving')) return { mode: 'serving', value: 1 };
  return { mode: 'weight', value: 100 };
}

/** Grams (or ml, as `per`) of the amount; a mode the product lacks counts as the default (AC-3.5, AC-6.2). */
export function amountGrams(p: Product, a: Amount): number {
  const { mode, value } = amountModes(p).includes(a.mode)
    ? a
    : defaultAmount(p);
  const unit =
    mode === 'pack'
      ? p.packG!
      : mode === 'serving'
        ? p.servingG!
        : mode === 'piece'
          ? p.packG! / p.pieces!
          : 1;
  return round1(Math.max(value * unit, 0.1));
}
