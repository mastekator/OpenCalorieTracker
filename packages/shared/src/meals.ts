import { z } from 'zod';
import {
  illustrationIdSchema,
  type IllustrationId,
} from './illustrations/dictionary.js';
import { normalizeGtin } from './barcodes/barcodes.js';
import { unitSchema, type DishUnit } from './units.js';

/** Key for matching dishes by name (ADR-0009): history lookups and remembered illustrations. */
export const nameKey = (name: string) =>
  name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type MealType = z.infer<typeof mealTypeSchema>;

/** Where a recipe ingredient's values came from; a recipe can't contain another recipe. */
export const ingredientSourceSchema = z.enum(['ai', 'manual', 'history']);
export type IngredientSource = z.infer<typeof ingredientSourceSchema>;

export const dishSourceSchema = z.enum([
  ...ingredientSourceSchema.options,
  'recipe',
  /** Values from a product found by its barcode (ADR-0034 §6). */
  'barcode',
  /** Values typed from the package label. */
  'label',
]);
export type DishSource = z.infer<typeof dishSourceSchema>;

// Grams carry at most one decimal so 10 oz = 283.5 g is stored as is (AC-3.15).
export const oneDecimal = (g: number) =>
  Math.abs(g * 10 - Math.round(g * 10)) < 1e-9;
const grams = z.number().min(0.1).max(5000).refine(oneDecimal);
export const kcalSchema = z.number().min(0).max(10000);
export const macroSchema = z.number().min(0).max(1000);
const macro = macroSchema;

/** The package weight, pieces and amount the user chose for a barcode (ADR-0037 §2, E-7.6). */
export const packPrefsSchema = z.object({
  packG: z.number().min(1).max(5000).optional(),
  pieces: z.number().int().min(1).max(1000).optional(),
  amount: z
    .object({
      mode: z.enum(['pack', 'serving', 'piece', 'weight']),
      value: z.number().positive(),
    })
    .refine((a) => a.mode !== 'pack' || a.value <= 10, { path: ['value'] })
    .refine((a) => a.mode !== 'piece' || Number.isInteger(a.value), {
      path: ['value'],
    })
    .optional(),
});
export type PackPrefs = z.infer<typeof packPrefsSchema>;

export const mealItemInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    /** Amount in `unit`; the field keeps its name for ml too (ADR-0038 §1). */
    grams,
    /** Omitted = 'g', as older clients send. */
    unit: unitSchema.optional(),
    kcal: kcalSchema,
    proteinG: macro,
    fatG: macro,
    carbsG: macro,
    source: dishSourceSchema,
    confidence: z.number().min(0).max(1).optional(),
    /** The recipe this portion was logged from (ADR-0023 §5); the dish stays a snapshot. */
    recipeId: z.number().int().positive().optional(),
    /** The product's barcode; stored normalized (ADR-0034 §3). */
    barcode: z
      .string()
      .transform(
        (s, ctx) => normalizeGtin(s) ?? (ctx.addIssue('Invalid GTIN'), z.NEVER),
      )
      .optional(),
    /** Manual choice on this dish; omitted = automatic. */
    illustration: illustrationIdSchema.optional(),
    /** Remembered for `barcode` (ADR-0037 §2); omitted fields keep their stored value. */
    pack: packPrefsSchema.optional(),
  })
  .refine((i) => i.confidence === undefined || i.source === 'ai', {
    path: ['confidence'],
  })
  .refine((i) => i.recipeId === undefined || i.source === 'recipe', {
    path: ['recipeId'],
  })
  .refine((i) => i.pack === undefined || i.barcode !== undefined, {
    path: ['pack'],
  });
export type MealItemInput = z.infer<typeof mealItemInputSchema>;

/** When the meal was eaten; the server only checks that `localDate` fits (ADR-0009 "День записи"). */
const when = {
  eatenAt: z.iso.datetime({ offset: true }),
  /** Minutes east of UTC: local time = eatenAt + tzOffsetMin. */
  tzOffsetMin: z.number().int().min(-840).max(840),
  localDate: z.iso.date(),
};
const items = z.array(mealItemInputSchema).min(1).max(50);

export const mealInputSchema = z.object({
  clientId: z.uuid(),
  ...when,
  mealType: mealTypeSchema,
  photoId: z.string().optional(),
  recalcOffer: z.boolean().optional(),
  items,
});
export type MealInput = z.infer<typeof mealInputSchema>;

const patch = {
  mealType: mealTypeSchema.optional(),
  recalcOffer: z.boolean().optional(),
  items: items.optional(),
  /** Attach a photo to a saved meal that has none (ADR-0009); online only. */
  photoId: z.string().optional(),
  /** Unix ms of the edit on the device; an older one than the stored edit is ignored (last edit wins). */
  editedAt: z.number().int().nonnegative().optional(),
};

/** Date and time change together or not at all. */
export const mealPatchSchema = z.union([
  z.object({ ...when, ...patch }),
  z.strictObject(patch),
]);
export type MealPatch = z.infer<typeof mealPatchSchema>;

export interface MealItem {
  name: string;
  grams: number;
  unit: DishUnit;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  source: DishSource;
  aiProvider: string | null;
  aiModel: string | null;
  confidence: number | null;
  /** Recipe the portion was logged from; null once that recipe is deleted (the dish stays). */
  recipeId: number | null;
  /** Normalized GTIN of the packaged product, if the dish has one. */
  barcode: string | null;
  /** Resolved: choice on this dish → choice for its name → matched by name (ADR-0009). */
  illustration: IllustrationId;
  /** True when `illustration` was picked on this dish: send it back in `PATCH` only then, or it freezes. */
  illustrationManual: boolean;
}

/** A saved meal with server-computed totals (sum of its dishes, unrounded). */
export interface Meal {
  id: number;
  clientId: string;
  eatenAt: string;
  tzOffsetMin: number;
  localDate: string;
  mealType: MealType;
  photo: { id: string; full: boolean } | null;
  recalcOffer: boolean;
  items: MealItem[];
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

/** `POST /api/dishes/previous`: the dishes on the edit screen, to look up in the user's history. */
export const previousDishesSchema = z.object({
  dishes: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        kcalPer100: z.number().min(0).max(10000).optional(),
      }),
    )
    .min(1)
    .max(20),
});
export type PreviousDishesInput = z.infer<typeof previousDishesSchema>;

/** The latest similar dish eaten in the last 90 days (ADR-0009 "Похожие блюда"). */
export interface PreviousDish {
  mealId: number;
  eatenAt: string;
  grams: number;
  unit: DishUnit;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  illustration: IllustrationId;
}

/** One entry per requested dish, in request order; null when nothing was found. */
export type PreviousDishesResponse = (PreviousDish | null)[];

/** `PUT /api/illustrations/choices`: remember an illustration for a dish name, or null to forget it. */
export const illustrationChoiceInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  illustration: illustrationIdSchema.nullable(),
  /** Unix ms of the user's choice; an older one than the stored choice is ignored. */
  editedAt: z.number().int().nonnegative().optional(),
});
export type IllustrationChoiceInput = z.infer<
  typeof illustrationChoiceInputSchema
>;

/** `GET /api/illustrations/choices`: all the user's remembered illustrations. */
export type IllustrationChoice = {
  nameKey: string;
  illustration: IllustrationId;
};

/**
 * UUID v4 for idempotency keys. `crypto.randomUUID` exists only in secure contexts, and a
 * self-hosted install is often opened over plain http on a LAN IP; getRandomValues works everywhere.
 */
export function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
