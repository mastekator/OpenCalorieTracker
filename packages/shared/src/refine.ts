import { z } from 'zod';
import { mealItemInputSchema } from './meals.js';
import { recognitionSchema } from './recognition.js';

/** What the user set on a dish by hand; the AI keeps it unless the note is about it (ADR-0020 §2). */
export const fixedFieldSchema = z.enum(['name', 'grams', 'nutrients']);
export type FixedField = z.infer<typeof fixedFieldSchema>;

const item = mealItemInputSchema.shape;

/** A dish of the current list sent for refining; `id` lives only for one request (ADR-0020 §3). */
export const refineDishInSchema = z.object({
  id: z.string().min(1).max(8),
  name: item.name,
  grams: item.grams,
  kcal: item.kcal,
  proteinG: item.proteinG,
  fatG: item.fatG,
  carbsG: item.carbsG,
  unit: item.unit,
  fixed: z.array(fixedFieldSchema),
});
export type RefineDishIn = z.infer<typeof refineDishInSchema>;

export const refineModeSchema = z.enum(['again', 'refine']);
export type RefineMode = z.infer<typeof refineModeSchema>;

/** POST /api/ai/refine body: the hint is optional for "again", required for "refine". */
export const refineRequestSchema = z
  .object({
    mode: refineModeSchema,
    requestId: z.uuid(),
    sessionId: z.uuid(),
    photoId: z.string().optional(),
    text: z.string().trim().max(300),
    dishes: z.array(refineDishInSchema).max(20),
  })
  .refine((r) => r.mode === 'again' || r.text.length > 0, { path: ['text'] });
export type RefineRequest = z.infer<typeof refineRequestSchema>;

/** `left`: refinements left in this session, null without an admin limit. */
export const refineResponseSchema = recognitionSchema.extend({
  left: z.number().int().nullable(),
});
export type RefineResponse = z.infer<typeof refineResponseSchema>;

/** An answer is worth asking about when it moves the dish by ≥ 50 kcal or ≥ 15 % (AC-10.2). */
export function questionMatters(
  dish: { kcal: number },
  option: { kcal: number },
) {
  const delta = Math.abs(option.kcal - dish.kcal);
  return delta > 0 && (delta >= 50 || delta >= dish.kcal * 0.15);
}
