import { describe, expect, it } from 'vitest';
import { isSimilarDensity } from './nutrition.js';

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
