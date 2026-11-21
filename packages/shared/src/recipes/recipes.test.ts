import { describe, expect, it } from 'vitest';
import { mealItemInputSchema } from '../meals.js';
import {
  per100,
  recipeBasisG,
  recipeInputSchema,
  recipePortion,
  recipeTotals,
  servingG,
  weightWarning,
  type RecipeInput,
} from './recipes.js';

const ing = (grams: number, kcal: number, p = 0, f = 0, c = 0) => ({
  name: 'x',
  grams,
  kcal,
  proteinG: p,
  fatG: f,
  carbsG: c,
  source: 'manual' as const,
});
const recipe = (
  ingredients: ReturnType<typeof ing>[],
  cookedG: number | null = null,
  servings: number | null = null,
): RecipeInput => ({
  name: 'Recipe',
  cookedG,
  servings,
  note: null,
  photoId: null,
  ingredients,
  steps: [],
  per100: null,
  servingG: null,
});
/** A recipe without ingredients, nutrients typed in per 100 g (ADR-0035). */
const typed = (kcal: number, servingG: number | null = null): RecipeInput => ({
  ...recipe([]),
  per100: { kcal, proteinG: 4, fatG: 20, carbsG: 25 },
  servingG,
});

describe('recipe calculation (AC-2.5)', () => {
  // [case, recipe, kcal total, basis g, kcal per 100 g, serving g]
  it.each([
    [
      'three ingredients',
      recipe([
        ing(200, 300, 10, 5, 50),
        ing(100, 150, 20),
        ing(50, 450, 0, 50),
      ]),
      900,
      350,
      (900 * 100) / 350,
      null,
    ],
    [
      'boiled down: cooked < raw',
      recipe([ing(1000, 400), ing(500, 200)], 900),
      600,
      900,
      (600 * 100) / 900,
      null,
    ],
    [
      'grains: cooked > raw',
      recipe([ing(200, 700), ing(400, 0)], 750),
      700,
      750,
      (700 * 100) / 750,
      null,
    ],
    ['no cooked weight', recipe([ing(250, 500)]), 500, 250, 200, null],
    ['with servings', recipe([ing(600, 1200)], null, 4), 1200, 600, 200, 150],
    [
      'ingredient of 0 g',
      recipe([ing(300, 600), ing(0, 0)]),
      600,
      300,
      200,
      null,
    ],
    [
      'Homemade pilaf',
      recipe([ing(1000, 1500), ing(500, 1987), ing(600, 0)], 2100, 6),
      3487,
      2100,
      (3487 * 100) / 2100,
      350,
    ],
    ['typed per 100 g, with a serving', typed(321, 120), 0, 0, 321, 120],
    ['typed per 100 g, grams only', typed(321), 0, 0, 321, null],
  ])('%s', (_, r, kcal, basis, kcal100, serving) => {
    expect(recipeTotals(r.ingredients).kcal).toBeCloseTo(kcal, 9);
    expect(recipeBasisG(r)).toBe(basis);
    expect(per100(r).kcal).toBeCloseTo(kcal100, 9);
    expect(servingG(r)).toBe(serving);
  });

  it('sums every nutrient and the raw weight', () => {
    expect(
      recipeTotals([ing(200, 300, 10, 5, 50), ing(100.5, 150, 20, 1, 2)]),
    ).toEqual({ kcal: 450, proteinG: 30, fatG: 6, carbsG: 52, rawG: 300.5 });
  });

  it('counts 1 ml as 1 g in the raw weight (ADR-0038 §5)', () => {
    const milk = { ...ing(300, 180), unit: 'ml' as const };
    expect(recipeTotals([ing(200, 300), milk]).rawG).toBe(500);
  });

  it('pilaf: 166 kcal/100 g and 581 per serving once rounded for display', () => {
    const r = recipe([ing(1000, 1500), ing(500, 1987), ing(600, 0)], 2100, 6);
    expect(Math.round(per100(r).kcal)).toBe(166);
    const portion = recipePortion({ ...r, id: 7 }, servingG(r)!);
    expect(Math.round(portion.kcal)).toBe(581);
  });

  it('N servings scale linearly', () => {
    const r = { ...recipe([ing(600, 1200, 60, 30, 90)], 500, 5), id: 1 };
    const one = recipePortion(r, servingG(r)!);
    const three = recipePortion(r, servingG(r)! * 3);
    expect(three.kcal).toBeCloseTo(one.kcal * 3, 9);
    expect(three.proteinG).toBeCloseTo(one.proteinG * 3, 9);
    expect(one.kcal).toBeCloseTo(240, 9);
  });

  it('raw weight 0 gives zeros, not a division by zero', () => {
    const r = recipe([ing(0, 0), ing(0, 0)], 300, 2);
    expect(per100(r)).toEqual({ kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 });
    expect(per100(recipe([ing(0, 0)])).kcal).toBe(0);
  });

  it('does not round', () => {
    expect(per100(recipe([ing(300, 100)])).kcal).toBe(100 / 3);
  });
});

describe('recipePortion', () => {
  const r = { ...recipe([ing(400, 800, 40, 20, 60)], null, 2), id: 12 };

  it('is a dish snapshot named after the recipe and linked to it', () => {
    expect(recipePortion({ ...r, name: 'Pilaf' }, 150)).toEqual({
      name: 'Pilaf',
      grams: 150,
      kcal: 300,
      proteinG: 15,
      fatG: 7.5,
      carbsG: 22.5,
      source: 'recipe',
      recipeId: 12,
    });
  });

  it('a recipe without ingredients uses its typed values', () => {
    expect(recipePortion({ ...typed(300, 150), id: 3 }, 150)).toMatchObject({
      grams: 150,
      kcal: 450,
      proteinG: 6,
      fatG: 30,
      carbsG: 37.5,
      recipeId: 3,
    });
  });

  it('passes mealItemInputSchema', () => {
    expect(mealItemInputSchema.safeParse(recipePortion(r, 200)).success).toBe(
      true,
    );
  });
});

describe('weightWarning (E-10.2)', () => {
  const w = (raw: number, cooked: number | null) =>
    weightWarning(recipe([ing(raw, 100)], cooked));

  it('warns at exactly 3x and beyond, both ways', () => {
    expect(w(100, 300)).toBe(true);
    expect(w(300, 100)).toBe(true);
    expect(w(100, 1000)).toBe(true);
    expect(w(1000, 100)).toBe(true);
  });

  it('stays quiet under 3x, without a cooked weight, or with raw 0', () => {
    expect(w(100, 299.9)).toBe(false);
    expect(w(299.9, 100)).toBe(false);
    expect(w(100, null)).toBe(false);
    expect(w(0, 100)).toBe(false);
    expect(weightWarning(typed(300))).toBe(false);
  });
});

describe('recipeInputSchema (AC-6.5, E-10.1)', () => {
  const base = recipe([ing(100, 200)]);
  const ok = (patch: Partial<RecipeInput>) =>
    recipeInputSchema.safeParse({ ...base, ...patch }).success;
  const many = <T>(n: number, x: T) => Array.from({ length: n }, () => x);
  const step = { text: 'Stir', photoId: null };

  it('accepts a minimal recipe', () => expect(ok({})).toBe(true));

  it('name: 1..80', () => {
    expect(ok({ name: 'a'.repeat(80) })).toBe(true);
    expect(ok({ name: 'a'.repeat(81) })).toBe(false);
    expect(ok({ name: '  ' })).toBe(false);
  });

  it('ingredients: 1..50', () => {
    expect(ok({ ingredients: [] })).toBe(false);
    expect(ok({ ingredients: many(50, ing(10, 10)) })).toBe(true);
    expect(ok({ ingredients: many(51, ing(10, 10)) })).toBe(false);
  });

  it('ingredient grams: 0..5000 with one decimal', () => {
    const g = (grams: number) => ok({ ingredients: [ing(grams, 0)] });
    expect(g(0)).toBe(true);
    expect(g(283.5)).toBe(true);
    expect(g(5000)).toBe(true);
    expect(g(5000.1)).toBe(false);
    expect(g(0.15)).toBe(false);
    expect(g(-1)).toBe(false);
  });

  it('ingredient source: no recipe inside a recipe', () => {
    const i = { ...ing(10, 10), source: 'recipe' };
    expect(
      recipeInputSchema.safeParse({ ...base, ingredients: [i] }).success,
    ).toBe(false);
  });

  it('steps: up to 30, each 1..1000', () => {
    expect(ok({ steps: many(30, step) })).toBe(true);
    expect(ok({ steps: many(31, step) })).toBe(false);
    expect(ok({ steps: [{ text: 'a'.repeat(1000), photoId: 'p1' }] })).toBe(
      true,
    );
    expect(ok({ steps: [{ text: 'a'.repeat(1001), photoId: null }] })).toBe(
      false,
    );
  });

  it('note: up to 2000', () => {
    expect(ok({ note: 'a'.repeat(2000) })).toBe(true);
    expect(ok({ note: 'a'.repeat(2001) })).toBe(false);
  });

  it('cooked weight: 1..50000, no 0 or negative', () => {
    expect(ok({ cookedG: 0 })).toBe(false);
    expect(ok({ cookedG: -1 })).toBe(false);
    expect(ok({ cookedG: 1 })).toBe(true);
    expect(ok({ cookedG: 50000 })).toBe(true);
    expect(ok({ cookedG: 50001 })).toBe(false);
    expect(ok({ cookedG: null })).toBe(true);
  });

  it('servings: whole 1..100', () => {
    expect(ok({ servings: 0 })).toBe(false);
    expect(ok({ servings: 1 })).toBe(true);
    expect(ok({ servings: 1.5 })).toBe(false);
    expect(ok({ servings: 100 })).toBe(true);
    expect(ok({ servings: 101 })).toBe(false);
  });

  describe('without ingredients (ADR-0035, E-1.a)', () => {
    const t = (patch: Partial<RecipeInput>) =>
      recipeInputSchema.safeParse({ ...typed(300), ...patch });

    it('accepts per100 with no ingredients, with or without a serving', () => {
      expect(t({}).success).toBe(true);
      expect(t({ servingG: 120 }).success).toBe(true);
      expect(t({ servingG: 5000 }).success).toBe(true);
    });

    it('blank macros count as 0', () => {
      const r = recipeInputSchema.parse({
        ...typed(300),
        per100: { kcal: 300, proteinG: null },
      });
      expect(r.per100).toEqual({ kcal: 300, proteinG: 0, fatG: 0, carbsG: 0 });
    });

    it('rejects no ingredients without per100, and both at once', () => {
      expect(ok({ ingredients: [], per100: null })).toBe(false);
      expect(t({ ingredients: [ing(10, 10)] }).success).toBe(false);
    });

    it('rejects weights and servings of the ingredient mode', () => {
      expect(t({ cookedG: 500 }).success).toBe(false);
      expect(t({ servings: 2 }).success).toBe(false);
      expect(ok({ servingG: 100 })).toBe(false);
    });

    it('kcal 0..900, macros >= 0 summing to at most 100', () => {
      const n = (kcal: number, p: number, f: number, c: number) =>
        t({ per100: { kcal, proteinG: p, fatG: f, carbsG: c } }).success;
      expect(n(0, 0, 0, 0)).toBe(true);
      expect(n(900, 0, 100, 0)).toBe(true);
      expect(n(900.1, 0, 0, 0)).toBe(false);
      expect(n(300, -1, 0, 0)).toBe(false);
      expect(n(300, 33.3, 33.3, 33.4)).toBe(true);
      expect(n(300, 40, 40, 20.1)).toBe(false);
    });

    it('serving: 1..5000 with one decimal', () => {
      expect(t({ servingG: 0.5 }).success).toBe(false);
      expect(t({ servingG: 5000.1 }).success).toBe(false);
      expect(t({ servingG: 12.25 }).success).toBe(false);
    });
  });
});
