import { describe, expect, it } from 'vitest';
import { parsedDraft, recipeParseRequestSchema } from './parse.js';
import { recipeInputSchema, recipeTotals } from './recipes.js';

const pasta = { kcal: 350, proteinG: 12, fatG: 1.5, carbsG: 70 };
const model = {
  name: ' Pasta ',
  servings: 2,
  cookedG: 500,
  ingredients: [
    { name: 'Pasta', grams: 200, per100: pasta },
    {
      name: 'Salt',
      grams: null,
      per100: { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
    },
  ],
  steps: ['Boil water.', '  ', 'Cook 10 min.'],
};

describe('parsedDraft (ADR-0023 §8)', () => {
  it('recalculates totals from per 100 g and marks "to taste" as 0 g, unsure', () => {
    const r = parsedDraft(model)!;
    expect(recipeInputSchema.parse(r.draft)).toEqual(r.draft);
    expect(r.draft).toMatchObject({
      name: 'Pasta',
      servings: 2,
      cookedG: 500,
      note: null,
      photoId: null,
    });
    expect(r.draft.ingredients[0]).toEqual({
      name: 'Pasta',
      grams: 200,
      kcal: 700,
      proteinG: 24,
      fatG: 3,
      carbsG: 140,
      source: 'ai',
    });
    expect(r.draft.ingredients[1]).toMatchObject({ grams: 0, kcal: 0 });
    expect(r.unsure).toEqual([1]);
    expect(recipeTotals(r.draft.ingredients).kcal).toBe(700);
    expect(r.draft.steps.map((s) => s.text)).toEqual([
      'Boil water.',
      'Cook 10 min.',
    ]);
  });

  it('cuts to the limits of recipeInputSchema and flags impossible rows', () => {
    const r = parsedDraft({
      name: 'x'.repeat(100),
      servings: 500,
      cookedG: 0,
      ingredients: [
        { name: '', grams: 10, per100: pasta },
        { name: 'Flour', grams: 9000, per100: pasta },
        {
          name: 'Magic',
          grams: 100,
          per100: { kcal: 5000, proteinG: 0, fatG: 0, carbsG: 0 },
        },
        {
          name: 'Butter',
          grams: 4000,
          per100: { kcal: 740, proteinG: 1, fatG: 82, carbsG: 1 },
        },
        ...Array.from({ length: 60 }, (_, i) => ({
          name: `i${i}`,
          grams: 1.04,
          per100: pasta,
        })),
      ],
      steps: Array.from({ length: 40 }, () => 's'.repeat(1200)),
    })!;
    expect(recipeInputSchema.safeParse(r.draft).success).toBe(true);
    expect(r.draft.name).toHaveLength(80);
    expect(r.draft.servings).toBeNull();
    expect(r.draft.cookedG).toBeNull();
    expect(r.draft.ingredients).toHaveLength(50);
    expect(r.draft.ingredients[0]).toMatchObject({
      name: 'Flour',
      grams: 5000,
    });
    expect(r.draft.ingredients[1]).toMatchObject({ name: 'Magic', kcal: 0 });
    expect(r.draft.ingredients[2]).toMatchObject({ kcal: 10000, fatG: 1000 });
    expect(r.draft.ingredients[3]!.grams).toBe(1);
    expect(r.unsure).toEqual([0, 1, 2]);
    expect(r.draft.steps).toHaveLength(30);
    expect(r.draft.steps[0]!.text).toHaveLength(1000);
  });

  it('is null without a name or ingredients', () => {
    expect(parsedDraft({ ...model, ingredients: [] })).toBeNull();
    expect(
      parsedDraft({
        ...model,
        ingredients: [{ name: ' ', grams: 1, per100: pasta }],
      }),
    ).toBeNull();
    expect(parsedDraft({ ...model, name: '  ' })).toBeNull();
  });
});

it('takes 1..10 000 characters of text', () => {
  expect(recipeParseRequestSchema.safeParse({ text: ' ' }).success).toBe(false);
  expect(
    recipeParseRequestSchema.safeParse({ text: 'a'.repeat(10000) }).success,
  ).toBe(true);
  expect(
    recipeParseRequestSchema.safeParse({ text: 'a'.repeat(10001) }).success,
  ).toBe(false);
});
