import { describe, expect, it } from 'vitest';
import { recipeInputSchema } from '@oct/shared';
import { recipeFromMeal } from './recipeFromMeal';

const item = (name: string, grams: number, kcal: number) => ({
  name,
  grams,
  kcal,
  proteinG: 1,
  fatG: 2,
  carbsG: 3,
});
const meal = (items: ReturnType<typeof item>[]) => ({
  mealType: 'lunch' as const,
  localDate: '2026-11-13',
  items,
});

describe('recipeFromMeal (AC-6.2)', () => {
  it('dishes become history ingredients; the name is the dish with the most kcal', () => {
    const r = recipeFromMeal(
      meal([
        item('Buckwheat', 180, 230),
        item('Grilled chicken', 150, 248),
        item('Egg', 100, 155),
      ]),
    );
    expect(r.draft!.name).toBe('Grilled chicken');
    expect(r.draft!.ingredients).toEqual([
      { ...item('Buckwheat', 180, 230), source: 'history' },
      { ...item('Grilled chicken', 150, 248), source: 'history' },
      { ...item('Egg', 100, 155), source: 'history' },
    ]);
    expect(r.draft).toMatchObject({ cookedG: null, servings: null, steps: [] });
    expect(r.fromMeal).toEqual({ mealType: 'lunch', localDate: '2026-11-13' });
    expect(recipeInputSchema.safeParse(r.draft).success).toBe(true);
  });

  it('a tie takes the first dish', () => {
    const r = recipeFromMeal(
      meal([item('Soup', 300, 200), item('Tea', 200, 200)]),
    );
    expect(r.draft!.name).toBe('Soup');
  });

  it('cuts names, grams and the count to the limits of recipeInputSchema', () => {
    const long = `  ${'a'.repeat(100)}  `;
    const r = recipeFromMeal(
      meal([
        item(long, 6000, 900),
        ...Array.from({ length: 60 }, (_, i) => item(`Dish ${i}`, 10, 1)),
      ]),
    );
    expect(r.draft!.name).toBe('a'.repeat(80));
    expect(r.draft!.ingredients).toHaveLength(50);
    expect(r.draft!.ingredients[0]).toMatchObject({
      name: 'a'.repeat(80),
      grams: 5000,
    });
    expect(recipeInputSchema.safeParse(r.draft).success).toBe(true);
  });
});
