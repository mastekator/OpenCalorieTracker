import { z } from 'zod';
import { fromPer100, scaleItem, type Nutrients } from '../nutrition.js';
import { per100, recipeTotals, type RecipeInput } from './recipes.js';

export const lighterChangeSchema = z.enum([
  'same',
  'reduced',
  'replaced',
  'added',
  'removed',
]);
export type LighterChange = z.infer<typeof lighterChangeSchema>;

const nutrientsSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
});

/**
 * A lighter variant as the model returns it (ADR-0023 §8): the full ingredient list, each row
 * pointing at the original by index. No range checks here, as with recognition: one odd row
 * must not fail the whole answer; `lighterVariant` drops bad variants.
 */
export const lighterModelSchema = z.object({
  variants: z.array(
    z.object({
      ingredients: z.array(
        z.object({
          change: lighterChangeSchema,
          /** Index of the original ingredient; null for "added". */
          from: z.number().nullable(),
          name: z.string(),
          grams: z.number(),
          /** Per 100 g; required for "replaced" and "added", ignored otherwise. */
          per100: nutrientsSchema.nullable(),
          why: z.string(),
        }),
      ),
    }),
  ),
});
export type LighterModelVariant = z.infer<
  typeof lighterModelSchema
>['variants'][number];

type Ingredient = RecipeInput['ingredients'][number];

/** One change for the screen: what happened to which ingredient and why (design OCT-160 §9). */
export interface LighterChangeLine {
  change: Exclude<LighterChange, 'same'>;
  /** Index of the original ingredient, null for "added". */
  from: number | null;
  /** The new name; the original one for "reduced" and "removed". */
  name: string;
  grams: number;
  why: string;
}

/** `POST /api/ai/recipes/:id/lighter` answer: 1..3 variants, ready to save as a recipe. */
export interface LighterVariant {
  ingredients: Ingredient[];
  changes: LighterChangeLine[];
}
export interface LighterResponse {
  variants: LighterVariant[];
}

const MAX_INGREDIENTS = 50;
const MAX_GRAMS = 5000;
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Per 100 g a food can have: no more than pure fat. */
const validPer100 = (n: Nutrients | null): n is Nutrients =>
  !!n &&
  n.kcal >= 0 &&
  n.kcal <= 900 &&
  [n.proteinG, n.fatG, n.carbsG].every((v) => v >= 0 && v <= 100) &&
  n.proteinG + n.fatG + n.carbsG <= 100;

/**
 * The model's variant recalculated by code (ADR-0023 §8): "same" and "reduced" come from the original
 * ingredient (`scaleItem`), "replaced" and "added" are the model's per 100 g × grams. Model kcal for
 * kept rows are ignored. An original the model left out stays as is. Null when the variant is
 * malformed, changes nothing or is not lighter than the original.
 */
export function lighterVariant(
  original: Ingredient[],
  variant: LighterModelVariant,
): LighterVariant | null {
  const used = new Set<number>();
  const ingredients: Ingredient[] = [];
  const changes: LighterChangeLine[] = [];
  for (const row of variant.ingredients) {
    const { change, from } = row;
    const src = from === null ? undefined : original[from];
    if (change === 'added' ? from !== null : !src || used.has(from!))
      return null;
    if (from !== null) used.add(from);
    const grams = round1(row.grams);
    const why = row.why.trim().slice(0, 200);
    if (change === 'same') {
      ingredients.push(src!);
      continue;
    }
    if (change === 'removed') {
      changes.push({ change, from, name: src!.name, grams: src!.grams, why });
      continue;
    }
    if (change === 'reduced') {
      if (!(grams >= 0 && grams < src!.grams)) return null;
      ingredients.push(scaleItem(src!, grams));
      changes.push({ change, from, name: src!.name, grams, why });
      continue;
    }
    const name = row.name.trim().slice(0, 80);
    if (!name || !(grams > 0 && grams <= MAX_GRAMS) || !validPer100(row.per100))
      return null;
    ingredients.push({
      name,
      grams,
      ...fromPer100(row.per100, grams),
      source: 'ai',
    });
    changes.push({ change, from, name, grams, why });
  }
  original.forEach((i, n) => {
    if (!used.has(n)) ingredients.push(i);
  });
  if (
    !changes.length ||
    !ingredients.length ||
    ingredients.length > MAX_INGREDIENTS ||
    recipeTotals(ingredients).kcal >= recipeTotals(original).kcal
  )
    return null;
  return { ingredients, changes };
}

type Calc = Pick<RecipeInput, 'cookedG' | 'servings'> & {
  ingredients: Ingredient[];
};

/** Kcal of one serving, or of 100 g when the recipe has no servings (AC-9.3). */
export const lighterBasisKcal = (r: Calc) =>
  r.servings ? recipeTotals(r.ingredients).kcal / r.servings : per100(r).kcal;

/**
 * "−N per serving" (or per 100 g): kcal saved by the variant. The cooked weight follows the raw one
 * in proportion: dropping oil makes the dish lighter, not denser.
 */
export function lighterSaving(r: Calc, v: Pick<LighterVariant, 'ingredients'>) {
  const rawG = recipeTotals(r.ingredients).rawG;
  const cookedG =
    r.cookedG === null || rawG === 0
      ? null
      : (r.cookedG * recipeTotals(v.ingredients).rawG) / rawG;
  return (
    lighterBasisKcal(r) -
    lighterBasisKcal({ ...r, cookedG, ingredients: v.ingredients })
  );
}
