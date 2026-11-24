import { z } from 'zod';
import {
  barcodeSchema,
  edibleChoiceSchema,
  ingredientSourceSchema,
  kcalSchema,
  macroSchema,
  oneDecimal,
  packPrefsSchema,
  type IngredientSource,
  type MealItemInput,
} from '../meals.js';
import { fromPer100, type Nutrients } from '../nutrition.js';
import { unitSchema, type DishUnit } from '../units.js';

/** Cooked weight that differs from the raw one this many times or more gets a warning (E-10.2). */
export const WEIGHT_WARNING_RATIO = 3;

/** Largest cooked weight of a recipe, grams (E-10.1). */
export const COOKED_G_MAX = 50000;

const photoId = z.string().min(1).nullable();

/** A blank macro of a recipe without ingredients counts as 0 (ADR-0035 §2). */
const per100Macro = z
  .number()
  .min(0)
  .max(100)
  .nullish()
  .transform((g) => g ?? 0);

/**
 * `POST`/`PUT /api/recipes` (ADR-0023 §3, ADR-0035 §2); limits from AC-6.5, E-10.1, E-1.a.
 * Either ingredients (1–50) or `per100` with no ingredients, weights or servings.
 */
export const recipeInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    /** Null: totals per 100 g use the raw weight (AC-2.3). */
    cookedG: z.number().min(1).max(COOKED_G_MAX).refine(oneDecimal).nullable(),
    /** Null: the recipe is logged in grams only (AC-2.4). */
    servings: z.number().int().min(1).max(100).nullable(),
    note: z.string().trim().max(2000).nullable(),
    photoId,
    ingredients: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(80),
            // 0 g is allowed: salt, spices "to taste".
            grams: z.number().min(0).max(5000).refine(oneDecimal),
            /** Omitted = 'g'; raw weight counts 1 ml as 1 g (ADR-0038 §5). */
            unit: unitSchema.optional(),
            /** Totals for these grams, like a meal dish. */
            kcal: kcalSchema,
            proteinG: macroSchema,
            fatG: macroSchema,
            carbsG: macroSchema,
            source: ingredientSourceSchema,
            /** Remembered like a meal dish's (ADR-0040 §2), not stored in the recipe. */
            barcode: barcodeSchema.optional(),
            pack: packPrefsSchema.optional(),
            edible: edibleChoiceSchema.optional(),
          })
          .refine((i) => i.pack === undefined || i.barcode !== undefined, {
            path: ['pack'],
          }),
      )
      .max(50),
    steps: z
      .array(z.object({ text: z.string().trim().min(1).max(1000), photoId }))
      .max(30),
    /** Set: a recipe without ingredients, nutrients typed in per 100 g (ADR-0035). */
    per100: z
      .object({
        kcal: z.number().min(0).max(900),
        proteinG: per100Macro,
        fatG: per100Macro,
        carbsG: per100Macro,
      })
      .nullable(),
    /** Grams in one serving of a recipe without ingredients; null: grams only. */
    servingG: z.number().min(1).max(5000).refine(oneDecimal).nullable(),
  })
  .superRefine((r, ctx) => {
    const issue = (path: (string | number)[]) =>
      ctx.addIssue({ code: 'custom', path, message: 'Invalid' });
    if (r.per100 === null) {
      if (r.ingredients.length === 0) issue(['ingredients']);
      if (r.servingG !== null) issue(['servingG']);
      return;
    }
    if (r.ingredients.length > 0) issue(['ingredients']);
    if (r.cookedG !== null) issue(['cookedG']);
    if (r.servings !== null) issue(['servings']);
    const { proteinG, fatG, carbsG } = r.per100;
    // 100 g of food holds at most 100 g of macros (E-1.a); epsilon for float sums.
    if (proteinG + fatG + carbsG > 100 + 1e-9) issue(['per100']);
  });
export type RecipeInput = z.infer<typeof recipeInputSchema>;

/** `PUT /api/recipes/:id`: `updatedAt` of the version the edit started from; a newer one → 409 `recipe_changed`. */
export const recipeUpdateSchema = recipeInputSchema.extend({
  updatedAt: z.iso.datetime(),
});
export type RecipeUpdate = z.infer<typeof recipeUpdateSchema>;

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
    unit: DishUnit;
    source: IngredientSource;
  })[];
  steps: { text: string; photoId: string | null }[];
  /** Set for a recipe without ingredients (ADR-0035). */
  per100: Nutrients | null;
  servingG: number | null;
  /** ISO time of the latest meal logged from this recipe; sorts the list. */
  lastLoggedAt: string | null;
  updatedAt: string;
}

/** What the calculations need: works for a saved recipe and for the editor's draft. */
type Calc = Pick<RecipeInput, 'cookedG' | 'servings'> & {
  ingredients: (Nutrients & { grams: number })[];
  // Optional: the editor's draft and recipes cached by an older client lack them.
  per100?: Nutrients | null;
  servingG?: number | null;
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
  if (r.per100) return r.per100;
  const { rawG, ...totals } = recipeTotals(r.ingredients);
  const basis = r.cookedG ?? rawG;
  if (rawG === 0 || basis === 0) return ZERO;
  // fromPer100 multiplies by grams / 100, so this gives totals × 100 / basis.
  return fromPer100(totals, 10000 / basis);
}

/** Grams in one serving, or null when the recipe has no servings (AC-2.4). */
export const servingG = (r: Calc) =>
  r.servingG ?? (r.servings ? recipeBasisG(r) / r.servings : null);

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
  if (r.per100 || r.cookedG === null || rawG === 0) return false;
  // Multiply, not divide: exactly 3× must warn without float noise.
  return (
    r.cookedG >= WEIGHT_WARNING_RATIO * rawG ||
    rawG >= WEIGHT_WARNING_RATIO * r.cookedG
  );
}
