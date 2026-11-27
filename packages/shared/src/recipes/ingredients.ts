import { z } from 'zod';
import { amountGrams, defaultAmount } from '../barcodes/amount.js';
import { productSchema, type Product } from '../barcodes/barcodes.js';
import { edibleSchema, lengthIn, orNull } from '../recognition.js';
import { DISH_GRAMS, G_PER_OZ, KG_PER_LB, round1 } from '../units.js';

const looseNumber = z.preprocess(
  (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null),
  z.number().nullable(),
);
/** A value from `values` (case-insensitive), anything else null: one odd value must not fail the answer. */
const looseEnum = <T extends string>(values: readonly [T, ...T[]]) =>
  z.preprocess(
    (v) =>
      typeof v === 'string' && values.includes(v.trim().toLowerCase() as T)
        ? v.trim().toLowerCase()
        : null,
    z.enum(values).nullable(),
  );

const READ_UNITS = ['g', 'kg', 'ml', 'l', 'lb', 'oz'] as const;

/**
 * One raw product as the model reads it (ADR-0040 §3): flat, every field required and nullable (OCT-437).
 * The model only reads numbers and units; the server picks the weight and does the arithmetic.
 */
export const ingredientModelSchema = z.object({
  name: z.string().refine(lengthIn(1, 80)),
  readValue: looseNumber,
  readUnit: looseEnum(READ_UNITS),
  weightFrom: looseEnum(['scale', 'package']),
  estimateG: looseNumber,
  pieces: looseNumber,
  unit: looseEnum(['ml']),
  kcal100: looseNumber,
  protein100: looseNumber,
  fat100: looseNumber,
  carbs100: looseNumber,
  confidence: looseNumber,
  barcode: orNull(z.string()),
  printedBarcode: orNull(z.string()),
  edibleRef: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? v.trim() : null),
    z.string().nullable(),
  ),
  ediblePct: looseNumber,
});
export type IngredientModelRow = z.infer<typeof ingredientModelSchema>;

/** What the model returns in `?mode=ingredients`; a missing list is an empty one. */
export const ingredientsModelSchema = z.object({
  items: z.preprocess((v) => v ?? [], z.array(ingredientModelSchema)),
});

const per100Schema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
});

/** One recognized raw product (ADR-0040 §4): grams by source, nutrients per 100 g and for the grams. */
export const recognizedIngredientSchema = z.object({
  name: z.string(),
  grams: z.number(),
  unit: z.enum(['g', 'ml']).optional(),
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  per100: per100Schema,
  /** Where `grams` came from; 'estimate' is highlighted for checking. */
  weight: z.enum(['scale', 'package', 'barcode', 'estimate']),
  source: z.enum(['ai', 'barcode']),
  barcode: z.string().optional(),
  /** The product found by the code, for «How much you used». */
  product: productSchema.optional(),
  /** `grams` is the edible part of `edible.grossG` (ADR-0039 §3). */
  edible: edibleSchema.optional(),
  /** How many whole items the estimate is for («3 pcs ≈ 55 g»); only with weight 'estimate'. */
  pieces: z.number().int().positive().optional(),
});
export type RecognizedIngredient = z.infer<typeof recognizedIngredientSchema>;

/** POST /api/photos/:id/recognize?mode=ingredients (ADR-0040 §4). */
export const ingredientsRecognitionSchema = z.object({
  items: z.array(recognizedIngredientSchema).max(50),
});
export type IngredientsRecognition = z.infer<
  typeof ingredientsRecognitionSchema
>;

const TO_BASE: Record<(typeof READ_UNITS)[number], number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  lb: KG_PER_LB * 1000,
  oz: G_PER_OZ,
};

const inRange = (g: number | null): g is number =>
  g !== null && g >= DISH_GRAMS.min && g <= DISH_GRAMS.max;
const nonNeg = (n: number | null | undefined) => round1(Math.max(0, n ?? 0));

/**
 * Picks the weight and nutrients of a read product (ADR-0040 §4): scale → package → the barcode
 * product's default amount → the model's estimate; a weight outside 1–5000 falls through to the next
 * source, and the row is dropped (null) when none is left. Nutrients per 100 g come from the product
 * when one was found, else from the model; totals are per100 × grams.
 */
export function toIngredient(
  row: IngredientModelRow,
  product: Product | null,
): RecognizedIngredient | null {
  const read =
    row.weightFrom && row.readValue !== null && row.readUnit
      ? round1(row.readValue * TO_BASE[row.readUnit])
      : null;
  const readMl = row.readUnit === 'ml' || row.readUnit === 'l';
  const productG = product
    ? amountGrams(product, defaultAmount(product))
    : null;
  const estimate = row.estimateG === null ? null : round1(row.estimateG);
  type Choice = [number, RecognizedIngredient['weight'], string | undefined];
  const pick: Choice | null = inRange(read)
    ? [read, row.weightFrom!, readMl ? 'ml' : product?.per]
    : product && inRange(productG)
      ? [productG, 'barcode', product.per]
      : inRange(estimate)
        ? [estimate, 'estimate', row.unit ?? product?.per]
        : null;
  if (!pick) return null;
  const [grams, weight, unit] = pick;
  const pieces =
    weight === 'estimate' &&
    row.pieces !== null &&
    Number.isInteger(row.pieces) &&
    row.pieces >= 1 &&
    row.pieces <= 99
      ? row.pieces
      : undefined;

  const per100 = {
    kcal: nonNeg(product?.kcal100 ?? row.kcal100),
    proteinG: nonNeg(product?.protein100 ?? row.protein100),
    fatG: nonNeg(product?.fat100 ?? row.fat100),
    carbsG: nonNeg(product?.carbs100 ?? row.carbs100),
  };
  const of = (n: number) => round1((n * grams) / 100);
  return {
    name: product?.name ?? row.name,
    grams,
    ...(unit === 'ml' && { unit }),
    kcal: of(per100.kcal),
    proteinG: of(per100.proteinG),
    fatG: of(per100.fatG),
    carbsG: of(per100.carbsG),
    per100,
    weight,
    source: product ? 'barcode' : 'ai',
    ...(product && { barcode: product.code, product }),
    ...(pieces && { pieces }),
  };
}
