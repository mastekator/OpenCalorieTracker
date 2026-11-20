import { z } from 'zod';
import { round1 } from '../units.js';
import { fromPer100, type Nutrients } from '../nutrition.js';
import { nutrientsSchema, validPer100 } from './lighter.js';
import { COOKED_G_MAX, type RecipeInput } from './recipes.js';

/** Longest pasted recipe text, characters (AC-6.5); the web counter uses it too. */
export const RECIPE_TEXT_MAX = 10000;

/** `POST /api/ai/recipes/parse` body (ADR-0023 §8, AC-6.5). */
export const recipeParseRequestSchema = z.object({
  text: z.string().trim().min(1).max(RECIPE_TEXT_MAX),
});

/**
 * A pasted recipe as the model returns it. No range checks, as with recognition: one odd row
 * must not fail the whole answer; `parsedDraft` fixes or flags it.
 */
export const recipeParseModelSchema = z.object({
  name: z.string(),
  servings: z.number().nullable(),
  cookedG: z.number().nullable(),
  ingredients: z.array(
    z.object({
      name: z.string(),
      /** Null: "to taste" or no amount in the text. */
      grams: z.number().nullable(),
      per100: nutrientsSchema.nullable(),
    }),
  ),
  steps: z.array(z.string()),
});
export type RecipeParseModel = z.infer<typeof recipeParseModelSchema>;

/** The draft for the editor; `unsure` are indexes of ingredients the user should check (AC-6.4). */
export interface RecipeParseResponse {
  draft: RecipeInput;
  unsure: number[];
}

const ZERO: Nutrients = { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 };
const inRange = (v: number | null, min: number, max: number) =>
  v !== null && Number.isFinite(v) && v >= min && v <= max;

/**
 * The model's answer made a valid `RecipeInput` by code (ADR-0023 §8): totals come from per 100 g ×
 * grams, texts and counts are cut to the limits of `recipeInputSchema`. A row without grams gets 0 g,
 * a row with impossible values gets zeros or the limit; both go to `unsure`. Null when nothing usable
 * is left: no name or no ingredients.
 */
export function parsedDraft(m: RecipeParseModel): RecipeParseResponse | null {
  const name = m.name.trim().slice(0, 80);
  const unsure: number[] = [];
  const ingredients = m.ingredients
    .map((row) => ({ ...row, name: row.name.trim().slice(0, 80) }))
    .filter((row) => row.name)
    .slice(0, 50)
    .map((row, i) => {
      const grams = inRange(row.grams, 0, Infinity)
        ? Math.min(round1(row.grams!), 5000)
        : 0;
      const per100 = validPer100(row.per100) ? row.per100 : ZERO;
      const n = fromPer100(per100, grams);
      // Pure fat at 5000 g passes per 100 g but not the totals limits.
      const capped = n.kcal > 10000 || n.proteinG + n.fatG + n.carbsG > 1000;
      if (grams === 0 || per100 === ZERO || row.grams! > 5000 || capped)
        unsure.push(i);
      return {
        name: row.name,
        grams,
        kcal: Math.min(n.kcal, 10000),
        proteinG: Math.min(n.proteinG, 1000),
        fatG: Math.min(n.fatG, 1000),
        carbsG: Math.min(n.carbsG, 1000),
        source: 'ai' as const,
      };
    });
  if (!name || !ingredients.length) return null;
  return {
    draft: {
      name,
      cookedG: inRange(m.cookedG, 1, COOKED_G_MAX) ? round1(m.cookedG!) : null,
      servings: inRange(m.servings, 1, 100) ? Math.round(m.servings!) : null,
      note: null,
      photoId: null,
      ingredients,
      steps: m.steps
        .map((text) => text.trim().slice(0, 1000))
        .filter(Boolean)
        .slice(0, 30)
        .map((text) => ({ text, photoId: null })),
      per100: null,
      servingG: null,
    },
    unsure,
  };
}
