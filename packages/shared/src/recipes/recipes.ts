import { z } from 'zod';
import {
  ingredientSourceSchema,
  kcalSchema,
  macroSchema,
  oneDecimal,
  type IngredientSource,
  type MealItemInput,
} from '../meals.js';
import { fromPer100, type Nutrients } from '../nutrition.js';

/** Cooked weight that differs from the raw one this many times or more gets a warning (E-10.2). */
export const WEIGHT_WARNING_RATIO = 3;

const photoId = z.string().min(1).nullable();

/** `POST`/`PUT /api/recipes` (ADR-0023 §3); limits from AC-6.5, E-10.1. */
export const recipeInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Null: totals per 100 g use the raw weight (AC-2.3). */
  cookedG: z.number().min(1).max(50000).refine(oneDecimal).nullable(),
  /** Null: the recipe is logged in grams only (AC-2.4). */
  servings: z.number().int().min(1).max(100).nullable(),
  note: z.string().trim().max(2000).nullable(),
  photoId,
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        // 0 g is allowed: salt, spices "to taste".
        grams: z.number().min(0).max(5000).refine(oneDecimal),
        /** Totals for these grams, like a meal dish. */
        kcal: kcalSchema,
        proteinG: macroSchema,
        fatG: macroSchema,
        carbsG: macroSchema,
        source: ingredientSourceSchema,
      }),
    )
    .min(1)
    .max(50),
  steps: z
    .array(z.object({ text: z.string().trim().min(1).max(1000), photoId }))
    .max(30),
});
export type RecipeInput = z.infer<typeof recipeInputSchema>;

export interface Recipe {
  id: number;
  name: string;
  cookedG: number | null;
  servings: number | null;
  note: string | null;
  photoId: string | null;
  ingredients: (Nutrients & {
    name: string;
    grams: number;
    source: IngredientSource;
  })[];
  steps: { text: string; photoId: string | null }[];
  /** ISO time of the latest meal logged from this recipe; sorts the list. */
  lastLoggedAt: string | null;
  updatedAt: string;
}

/** What the calculations need: works for a saved recipe and for the editor's draft. */
type Calc = Pick<RecipeInput, 'cookedG' | 'servings'> & {
  ingredients: (Nutrients & { grams: number })[];
};

const ZERO: Nutrients = { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 };

/** Sum of the ingredients and their raw weight, unrounded (AC-2.5). */
export const recipeTotals = (ingredients: Calc['ingredients']) =>
  ingredients.reduce(
    (t, i) => ({
      kcal: t.kcal + i.kcal,
      proteinG: t.proteinG + i.proteinG,
      fatG: t.fatG + i.fatG,
      carbsG: t.carbsG + i.carbsG,
      rawG: t.rawG + i.grams,
    }),
    { ...ZERO, rawG: 0 },
  );

/** Weight the totals are spread over: cooked if given, else raw (AC-2.3). */
export const recipeBasisG = (r: Calc) =>
  r.cookedG ?? recipeTotals(r.ingredients).rawG;

/** Nutrients per 100 g of the finished dish; zeros when there is no weight to divide by. */
export function per100(r: Calc): Nutrients {
  const { rawG, ...totals } = recipeTotals(r.ingredients);
  const basis = r.cookedG ?? rawG;
  if (rawG === 0 || basis === 0) return ZERO;
  // fromPer100 multiplies by grams / 100, so this gives totals × 100 / basis.
  return fromPer100(totals, 10000 / basis);
}

/** Grams in one serving, or null when the recipe has no servings (AC-2.4). */
export const servingG = (r: Calc) =>
  r.servings ? recipeBasisG(r) / r.servings : null;

/** `grams` of the recipe as one meal dish, a snapshot linked back to it (AC-4.3, 4.4). */
export const recipePortion = (
  r: Calc & Pick<Recipe, 'id' | 'name'>,
  grams: number,
): MealItemInput => ({
  name: r.name,
  grams,
  ...fromPer100(per100(r), grams),
  source: 'recipe',
  recipeId: r.id,
});

/** Cooked weight is 3+ times off the raw one either way: likely a typo (E-10.2). */
export function weightWarning(r: Calc) {
  const { rawG } = recipeTotals(r.ingredients);
  if (r.cookedG === null || rawG === 0) return false;
  // Multiply, not divide: exactly 3× must warn without float noise.
  return (
    r.cookedG >= WEIGHT_WARNING_RATIO * rawG ||
    rawG >= WEIGHT_WARNING_RATIO * r.cookedG
  );
}
