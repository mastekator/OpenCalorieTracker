import { z } from 'zod';

/** Key for matching dishes by name (ADR-0009): history lookups and remembered illustrations. */
export const nameKey = (name: string) =>
  name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type MealType = z.infer<typeof mealTypeSchema>;

export const dishSourceSchema = z.enum(['ai', 'manual', 'history']);
export type DishSource = z.infer<typeof dishSourceSchema>;

// Grams carry at most one decimal so 10 oz = 283.5 g is stored as is (AC-3.15).
const grams = z
  .number()
  .min(0.1)
  .max(5000)
  .refine((g) => Math.abs(g * 10 - Math.round(g * 10)) < 1e-9);
const macro = z.number().min(0).max(1000);

export const mealItemInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    grams,
    kcal: z.number().min(0).max(10000),
    proteinG: macro,
    fatG: macro,
    carbsG: macro,
    source: dishSourceSchema,
    confidence: z.number().min(0).max(1).optional(),
  })
  .refine((i) => i.confidence === undefined || i.source === 'ai', {
    path: ['confidence'],
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

/** Date and time change together or not at all. */
export const mealPatchSchema = z.union([
  z.object({
    ...when,
    mealType: mealTypeSchema.optional(),
    recalcOffer: z.boolean().optional(),
    items: items.optional(),
  }),
  z.strictObject({
    mealType: mealTypeSchema.optional(),
    recalcOffer: z.boolean().optional(),
    items: items.optional(),
  }),
]);
export type MealPatch = z.infer<typeof mealPatchSchema>;

export interface MealItem {
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  source: DishSource;
  aiProvider: string | null;
  aiModel: string | null;
  confidence: number | null;
  /** Resolved illustration id; null until dish illustrations land (OCT-63). */
  illustration: string | null;
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
