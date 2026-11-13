import { describe, expect, it } from 'vitest';
import { compare, type Expected } from './compare.js';

const dish = (kcal: number, confidence: number) => ({
  name: 'x',
  grams: 100,
  kcal,
  proteinG: 0,
  fatG: 0,
  carbsG: 0,
  confidence,
});
const eggs: Expected = {
  file: 'eggs.jpg',
  dishes: ['egg', 'egg'],
  kcal: [100, 200],
  level: 'exact',
};
const plov: Expected = { ...eggs, file: 'plov.jpg', level: 'notExact' };
const chair: Expected = { file: 'chair.jpg', empty: true };

describe('compare', () => {
  it('passes exact items when every dish is exact and kcal fits', () => {
    expect(compare(eggs, { dishes: [dish(78, 0.96), dish(78, 0.95)] })).toBe(
      null,
    );
  });

  it('fails exact items when one dish is only high', () => {
    expect(compare(eggs, { dishes: [dish(78, 0.96), dish(78, 0.9)] })).toMatch(
      /exact/,
    );
  });

  it('fails a mixed dish that comes back exact', () => {
    expect(compare(plov, { dishes: [dish(150, 0.97)] })).toMatch(/mixed/);
    expect(compare(plov, { dishes: [dish(150, 0.9)] })).toBe(null);
  });

  it('checks the kcal range on the total', () => {
    expect(compare(eggs, { dishes: [dish(150, 1), dish(150, 1)] })).toMatch(
      /kcal 300 not in 100-200/,
    );
    expect(compare(eggs, { dishes: [] })).toBe('no dishes');
  });

  it('expects an empty list for non-food', () => {
    expect(compare(chair, { dishes: [] })).toBe(null);
    expect(compare(chair, { dishes: [dish(10, 0.3)] })).toMatch(/no dishes/);
  });
});
