import { describe, expect, it } from 'vitest';
import type { Product } from '@oct/shared';
import { hasShares, stepAmount, toMode } from './amount';

const COOKIES: Product = {
  code: '4607012345678',
  name: 'Oat cookies',
  brand: null,
  kcal100: 440,
  protein100: 6,
  fat100: 16,
  carbs100: 68,
  per: 'g',
  servingG: 30,
  servingText: null,
  packG: 200,
  pieces: 12,
};

describe('stepAmount', () => {
  it('steps ¼ package, ½ serving, 1 piece', () => {
    expect(stepAmount(COOKIES, { mode: 'pack', value: 0.5 }, 1).value).toBe(
      0.75,
    );
    expect(stepAmount(COOKIES, { mode: 'serving', value: 1 }, -1).value).toBe(
      0.5,
    );
    expect(stepAmount(COOKIES, { mode: 'piece', value: 2 }, 1).value).toBe(3);
  });

  it('goes to the next step on the grid from a third', () => {
    expect(stepAmount(COOKIES, { mode: 'pack', value: 1 / 3 }, 1).value).toBe(
      0.5,
    );
    expect(stepAmount(COOKIES, { mode: 'pack', value: 1 / 3 }, -1).value).toBe(
      0.25,
    );
  });

  it('never goes under one step or over 10 packages', () => {
    expect(stepAmount(COOKIES, { mode: 'pack', value: 0.25 }, -1).value).toBe(
      0.25,
    );
    expect(stepAmount(COOKIES, { mode: 'piece', value: 1 }, -1).value).toBe(1);
    expect(stepAmount(COOKIES, { mode: 'pack', value: 10 }, 1).value).toBe(10);
  });
});

describe('toMode', () => {
  it('keeps the grams, rounded to the step', () => {
    expect(toMode(COOKIES, 'pack', 100)).toEqual({ mode: 'pack', value: 0.5 });
    expect(toMode(COOKIES, 'piece', 100)).toEqual({ mode: 'piece', value: 6 });
    expect(toMode(COOKIES, 'serving', 10)).toEqual({
      mode: 'serving',
      value: 0.5,
    });
    expect(toMode(COOKIES, 'weight', 33.3)).toEqual({
      mode: 'weight',
      value: 33,
    });
  });
});

describe('hasShares', () => {
  it('needs a package or a serving', () => {
    expect(hasShares(COOKIES)).toBe(true);
    expect(hasShares({ ...COOKIES, packG: null, servingG: null })).toBe(false);
    expect(hasShares(undefined)).toBe(false);
  });
});
