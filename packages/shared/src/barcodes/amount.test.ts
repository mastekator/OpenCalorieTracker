import { describe, expect, it } from 'vitest';
import { amountGrams, amountModes, defaultAmount } from './amount.js';
import type { Product } from './barcodes.js';

const product = (over: Partial<Product> = {}): Product => ({
  code: '4006381333931',
  name: 'Cookies',
  brand: null,
  kcal100: 450,
  protein100: 6,
  fat100: 20,
  carbs100: 60,
  per: 'g',
  servingG: 30,
  servingText: null,
  ...over,
});

describe('amountModes (ADR-0037 §5)', () => {
  it('all four when the package, serving and pieces are known', () => {
    expect(amountModes(product({ packG: 200, pieces: 8 }))).toEqual([
      'pack',
      'serving',
      'piece',
      'weight',
    ]);
  });

  it('grams only without package data', () => {
    expect(amountModes(product({ servingG: null }))).toEqual(['weight']);
  });

  it('E-7.1: a serving as big as the package or bigger is not offered', () => {
    expect(amountModes(product({ packG: 30 }))).toEqual(['pack', 'weight']);
    expect(amountModes(product({ packG: 25 }))).toEqual(['pack', 'weight']);
  });

  it('no pieces for one piece or without the package weight', () => {
    expect(amountModes(product({ packG: 200, pieces: 1 }))).not.toContain(
      'piece',
    );
    expect(amountModes(product({ pieces: 8 }))).not.toContain('piece');
  });
});

describe('amountGrams', () => {
  const p = product({ packG: 200, pieces: 8 });

  it('each mode in grams, fractions of the unit', () => {
    expect(amountGrams(p, { mode: 'pack', value: 0.5 })).toBe(100);
    expect(amountGrams(p, { mode: 'serving', value: 2 })).toBe(60);
    expect(amountGrams(p, { mode: 'piece', value: 3 })).toBe(75);
    expect(amountGrams(p, { mode: 'weight', value: 42 })).toBe(42);
  });

  it('AC-3.4: more pieces than the package holds just multiply', () => {
    expect(amountGrams(p, { mode: 'piece', value: 12 })).toBe(300);
  });

  it('a mode the product lacks counts as the default', () => {
    expect(amountGrams(product(), { mode: 'piece', value: 3 })).toBe(30);
  });

  it('AC-6.2: ml products stay in ml', () => {
    const juice = product({ per: 'ml', servingG: 250, packG: 1000 });
    expect(amountGrams(juice, { mode: 'serving', value: 1 })).toBe(250);
    expect(amountGrams(juice, { mode: 'pack', value: 0.25 })).toBe(250);
  });
});

describe('defaultAmount (AC-5.2, AC-3.8)', () => {
  it('the last pick when its mode is available', () => {
    const last = { mode: 'piece', value: 2 } as const;
    expect(defaultAmount(product({ packG: 200, pieces: 8, last }))).toEqual(
      last,
    );
  });

  it('a last pick the product no longer allows falls through to the package', () => {
    const last = { mode: 'piece', value: 2 } as const;
    expect(defaultAmount(product({ packG: 200, last }))).toEqual({
      mode: 'pack',
      value: 1,
    });
  });

  it('package → serving → 100', () => {
    expect(defaultAmount(product({ packG: 200 }))).toEqual({
      mode: 'pack',
      value: 1,
    });
    expect(defaultAmount(product())).toEqual({ mode: 'serving', value: 1 });
    expect(defaultAmount(product({ servingG: null }))).toEqual({
      mode: 'weight',
      value: 100,
    });
  });
});
