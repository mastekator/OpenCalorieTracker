import { z } from 'zod';

const GTIN_LENGTHS = [8, 12, 13, 14];

/** A GTIN as stored and looked up (ADR-0034 §3): digits only, valid check digit, UPC-A padded to 13; null if invalid. */
export function normalizeGtin(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits) || !GTIN_LENGTHS.includes(digits.length))
    return null;
  // Weights 3, 1, 3, … from the digit left of the check digit.
  let sum = 0;
  for (let i = digits.length - 2, w = 3; i >= 0; i--, w = 4 - w)
    sum += Number(digits[i]) * w;
  if ((10 - (sum % 10)) % 10 !== Number(digits.at(-1))) return null;
  return digits.length === 12 ? `0${digits}` : digits;
}

const per100 = z.number().nonnegative().nullable();

/** A packaged product: from Open Food Facts or the user's own (ADR-0034 §3). */
export const productSchema = z.object({
  code: z.string(),
  name: z.string().nullable(),
  brand: z.string().nullable(),
  kcal100: per100,
  protein100: per100,
  fat100: per100,
  carbs100: per100,
  per: z.enum(['g', 'ml']),
  servingG: z.number().positive().nullable(),
  servingText: z.string().nullable(),
  /** Own products only: when it was last saved (ISO). */
  savedAt: z.string().optional(),
});
export type Product = z.infer<typeof productSchema>;

/** What Open Food Facts said, or why it was not asked. */
export const offStatusSchema = z.enum([
  'found',
  'missing',
  'down',
  'disabled',
  'blocked',
  'skipped',
]);
export type OffStatus = z.infer<typeof offStatusSchema>;

/** GET /barcodes/:code. */
export const barcodeLookupSchema = z.object({
  product: productSchema.nullable(),
  from: z.enum(['mine', 'off']).nullable(),
  off: offStatusSchema,
});
export type BarcodeLookup = z.infer<typeof barcodeLookupSchema>;

/** POST /photos/:id/barcodes: the codes read from the photo, each looked up. */
export const photoBarcodesSchema = z.object({
  codes: z.array(z.object({ code: z.string(), result: barcodeLookupSchema })),
});
export type PhotoBarcodesResponse = z.infer<typeof photoBarcodesSchema>;

/** GET /products/mine. */
export const myProductsSchema = z.object({
  products: z.array(productSchema),
});
export type MyProducts = z.infer<typeof myProductsSchema>;
