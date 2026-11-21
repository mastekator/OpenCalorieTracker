import { describe, expect, it } from 'vitest';
import {
  applyMealPatch,
  sameMealContent,
  type MealContent,
} from './content.js';

const dish = {
  name: 'Oatmeal',
  grams: 200,
  unit: 'g' as const,
  kcal: 140,
  proteinG: 5,
  fatG: 3,
  carbsG: 24,
};
const meal: MealContent = {
  mealType: 'breakfast',
  eatenAt: '2026-11-20T08:00:00.000Z',
  tzOffsetMin: 180,
  localDate: '2026-11-20',
  photo: null,
  items: [dish],
};
const input = { ...dish, source: 'manual' as const };

describe('applyMealPatch + sameMealContent', () => {
  it('an empty patch or a repeat of the current content changes nothing', () => {
    expect(sameMealContent(applyMealPatch(meal, {}), meal)).toBe(true);
    const repeat = applyMealPatch(meal, {
      eatenAt: '2026-11-20T11:00:00+03:00',
      tzOffsetMin: 180,
      localDate: '2026-11-20',
      mealType: 'breakfast',
      items: [{ ...input, unit: undefined }],
    });
    expect(sameMealContent(repeat, meal)).toBe(true);
  });

  it.each([
    { mealType: 'lunch' as const },
    { items: [{ ...input, grams: 250 }] },
    { items: [input, input] },
    { photoId: 'p1' },
    {
      eatenAt: '2026-11-20T09:00:00.000Z',
      tzOffsetMin: 180,
      localDate: '2026-11-20',
    },
  ])('a different edit is not the same: %o', (patch) => {
    expect(sameMealContent(applyMealPatch(meal, patch), meal)).toBe(false);
  });

  it('dishes compare in order', () => {
    const two = { ...meal, items: [dish, { ...dish, name: 'Tea' }] };
    const swapped = { ...meal, items: [{ ...dish, name: 'Tea' }, dish] };
    expect(sameMealContent(two, swapped)).toBe(false);
  });
});
