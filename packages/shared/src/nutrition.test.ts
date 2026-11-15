import { describe, expect, it } from 'vitest';
import {
  fromPer100,
  isSimilarDensity,
  kcalFromMacros,
  macrosMismatch,
  mealTypeAt,
  scaleItem,
} from './nutrition.js';

describe('isSimilarDensity', () => {
  it('allows 25 % of the larger value', () => {
    expect(isSimilarDensity(100, 75)).toBe(true);
    expect(isSimilarDensity(100, 74)).toBe(false);
    expect(isSimilarDensity(400, 300)).toBe(true);
    expect(isSimilarDensity(400, 299)).toBe(false);
  });

  it('allows 20 kcal/100 g for small values', () => {
    expect(isSimilarDensity(5, 25)).toBe(true);
    expect(isSimilarDensity(5, 26)).toBe(false);
    expect(isSimilarDensity(0, 15)).toBe(true);
    expect(isSimilarDensity(0, 0)).toBe(true);
  });

  it('is symmetric', () => {
    expect(isSimilarDensity(75, 100)).toBe(true);
    expect(isSimilarDensity(26, 5)).toBe(false);
  });
});

describe('scaleItem (AC-3.2)', () => {
  const rice = {
    name: 'Rice',
    grams: 150,
    kcal: 300,
    proteinG: 6,
    fatG: 1.5,
    carbsG: 63,
  };

  it('scales every value from the original', () => {
    expect(scaleItem(rice, 200)).toEqual({
      name: 'Rice',
      grams: 200,
      kcal: 400,
      proteinG: 8,
      fatG: 2,
      carbsG: 84,
    });
  });

  it('returns exactly the original after 150 → 1 → 150', () => {
    expect(scaleItem(rice, 1).kcal).toBe(2);
    expect(scaleItem(rice, 150).kcal).toBe(300);
  });
});

describe('fromPer100 (AC-5.3)', () => {
  it('multiplies by grams / 100', () => {
    expect(
      fromPer100({ kcal: 100, proteinG: 10, fatG: 2, carbsG: 4 }, 250),
    ).toEqual({
      kcal: 250,
      proteinG: 25,
      fatG: 5,
      carbsG: 10,
    });
  });
});

describe('macros check (AC-5.4)', () => {
  it('uses 4/9/4 kcal per gram', () => {
    expect(kcalFromMacros(10, 10, 10)).toBe(170);
  });

  it('warns above 30 %', () => {
    expect(macrosMismatch(170, 10, 10, 10)).toBe(0);
    expect(macrosMismatch(100, 10, 10, 10)).toBeGreaterThan(0.3);
    expect(macrosMismatch(130, 10, 10, 10)).toBeLessThan(0.3);
    expect(macrosMismatch(0, 0, 0, 0)).toBe(0);
    expect(macrosMismatch(250, 0, 0, 0)).toBe(1); // macros left empty
  });
});

describe('mealTypeAt (AC-3.10)', () => {
  it.each([
    [4, 'snack'],
    [5, 'breakfast'],
    [10, 'breakfast'],
    [11, 'lunch'],
    [15, 'lunch'],
    [16, 'dinner'],
    [21, 'dinner'],
    [22, 'snack'],
    [0, 'snack'],
  ] as const)('%i:00 → %s', (hour, type) => {
    expect(mealTypeAt(hour)).toBe(type);
  });
});
