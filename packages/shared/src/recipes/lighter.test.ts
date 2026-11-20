import { describe, expect, it } from 'vitest';
import { recipeInputSchema } from './recipes.js';
import {
  lighterSaving,
  lightened,
  lighterVariant,
  type LighterModelVariant,
} from './lighter.js';

const ing = (name: string, grams: number, kcal: number, fatG = 0) => ({
  name,
  grams,
  kcal,
  proteinG: 0,
  fatG,
  carbsG: 0,
  source: 'manual' as const,
});
const rice = ing('Rice', 200, 260);
const oil = ing('Oil', 20, 180, 20);
const cheese = ing('Cheese', 50, 200, 15);
const original = [rice, oil, cheese];

type Row = LighterModelVariant['ingredients'][number];
const row = (over: Partial<Row>): Row => ({
  change: 'same',
  from: 0,
  name: 'x',
  grams: 0,
  per100: null,
  why: '',
  ...over,
});
const lies = { kcal: 1, proteinG: 0, fatG: 0, carbsG: 0 };

describe('lighterVariant', () => {
  it('recalculates every row by code, ignoring the model kcal', () => {
    const v = lighterVariant(original, {
      ingredients: [
        row({ change: 'same', from: 0, grams: 999, per100: lies }),
        row({
          change: 'reduced',
          from: 1,
          grams: 5,
          per100: lies,
          why: ' less oil ',
        }),
        row({
          change: 'replaced',
          from: 2,
          name: 'Cottage cheese',
          grams: 50,
          per100: { kcal: 100, proteinG: 18, fatG: 2, carbsG: 3 },
        }),
        row({
          change: 'added',
          from: null,
          name: 'Spinach',
          grams: 30.04,
          per100: { kcal: 20, proteinG: 3, fatG: 0, carbsG: 1 },
        }),
      ],
    })!;
    expect(v.ingredients).toEqual([
      rice,
      { ...oil, grams: 5, kcal: 45, fatG: 5 },
      {
        name: 'Cottage cheese',
        grams: 50,
        kcal: 50,
        proteinG: 9,
        fatG: 1,
        carbsG: 1.5,
        source: 'ai',
      },
      {
        name: 'Spinach',
        grams: 30,
        kcal: 6,
        proteinG: 0.9,
        fatG: 0,
        carbsG: 0.3,
        source: 'ai',
      },
    ]);
    expect(v.changes).toEqual([
      { change: 'reduced', from: 1, name: 'Oil', grams: 5, why: 'less oil' },
      {
        change: 'replaced',
        from: 2,
        name: 'Cottage cheese',
        grams: 50,
        why: '',
      },
      { change: 'added', from: null, name: 'Spinach', grams: 30, why: '' },
    ]);
  });

  it('drops a removed row and keeps originals the model left out', () => {
    const v = lighterVariant(original, {
      ingredients: [row({ change: 'removed', from: 2, grams: 50 })],
    })!;
    expect(v.ingredients).toEqual([rice, oil]);
    expect(v.changes).toEqual([
      { change: 'removed', from: 2, name: 'Cheese', grams: 50, why: '' },
    ]);
  });

  it.each<[string, Row[]]>([
    ['bad index', [row({ change: 'removed', from: 7 })]],
    [
      'index used twice',
      [row({ change: 'removed', from: 1 }), row({ change: 'same', from: 1 })],
    ],
    [
      'added with an index',
      [row({ change: 'added', from: 0, grams: 10, per100: lies })],
    ],
    [
      'replaced without per100',
      [row({ change: 'replaced', from: 2, name: 'Tofu', grams: 50 })],
    ],
    [
      'impossible per100',
      [
        row({
          change: 'replaced',
          from: 2,
          name: 'Tofu',
          grams: 50,
          per100: { ...lies, kcal: 2000 },
        }),
      ],
    ],
    ['reduced that grows', [row({ change: 'reduced', from: 1, grams: 40 })]],
    ['no change', [row({ change: 'same', from: 0 })]],
    [
      'not lighter',
      [
        row({
          change: 'added',
          from: null,
          name: 'Nuts',
          grams: 100,
          per100: { kcal: 600, proteinG: 20, fatG: 50, carbsG: 10 },
        }),
      ],
    ],
    ['nothing left', [0, 1, 2].map((from) => row({ change: 'removed', from }))],
  ])('drops a variant with %s', (_, ingredients) => {
    expect(lighterVariant(original, { ingredients })).toBeNull();
  });
});

describe('lighterSaving', () => {
  it('lightened: the cooked weight follows the raw one, to 0.1 g', () => {
    expect(
      lightened({ cookedG: 220, servings: null, ingredients: original }, v)
        .cookedG,
    ).toBe(203.7);
  });
  it('lightened: the cooked weight stays within the recipe max of 50000 g', () => {
    const r = lightened(
      { cookedG: 49000, servings: null, ingredients: original },
      { ingredients: [...original, ing('Nuts', 100, 600)] },
    );
    expect(r.cookedG).toBe(50000);
    expect(
      recipeInputSchema.safeParse({
        ...r,
        name: 'Rice',
        note: null,
        photoId: null,
        steps: [],
        per100: null,
        servingG: null,
      }).success,
    ).toBe(true);
  });
  const v = { ingredients: [rice, cheese] };
  it('is per serving with servings', () => {
    expect(
      lighterSaving({ cookedG: null, servings: 2, ingredients: original }, v),
    ).toBe(90);
  });
  it('is per 100 g without servings; the cooked weight follows the raw one', () => {
    // 640 kcal / 270 g raw → 220 g cooked; 460 kcal / 250 g raw → 220 × 250/270 g cooked.
    const saving = lighterSaving(
      { cookedG: 220, servings: null, ingredients: original },
      v,
    );
    expect(saving).toBeCloseTo(
      (640 / 220) * 100 - (460 / ((220 * 250) / 270)) * 100,
      1,
    );
  });
});
