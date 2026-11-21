import { describe, expect, it } from 'vitest';
import {
  applyMealPatch,
  diffMeals,
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

describe('diffMeals', () => {
  const tea = { ...dish, name: 'Tea', kcal: 2 };

  it('the same meal differs in nothing', () => {
    expect(diffMeals(meal, meal)).toEqual({
      fields: [],
      dishes: [{ mine: dish, theirs: dish, changed: false }],
    });
  });

  it('pairs dishes by nameKey whatever the order, and marks added and removed', () => {
    const mine = { ...meal, items: [dish, { ...tea, grams: 300 }] };
    const theirs = {
      ...meal,
      mealType: 'lunch' as const,
      items: [
        { ...tea, name: ' TEA ' },
        { ...dish, name: 'Bread' },
      ],
    };
    const { fields, dishes } = diffMeals(mine, theirs);
    expect(fields).toEqual(['mealType']);
    expect(dishes).toEqual([
      { mine: dish, theirs: null, changed: true },
      { mine: mine.items[1], theirs: theirs.items[0], changed: true },
      { mine: null, theirs: theirs.items[1], changed: true },
    ]);
  });

  it('repeated names pair in order', () => {
    const second = { ...dish, grams: 100 };
    const { dishes } = diffMeals(
      { ...meal, items: [dish, second] },
      { ...meal, items: [dish, { ...second, grams: 120 }] },
    );
    expect(dishes.map((d) => [d.theirs?.grams, d.changed])).toEqual([
      [200, false],
      [120, true],
    ]);
  });

  it('time and photo count as fields, the same instant in another offset form does not', () => {
    const { fields } = diffMeals(meal, {
      ...meal,
      eatenAt: '2026-11-20T11:00:00+03:00',
      photo: { id: 'p1' },
    });
    expect(fields).toEqual(['photo']);
  });
});
