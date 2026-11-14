import { z } from 'zod';

/**
 * One dish as the AI returns it (ADR-0007): numbers are for the whole portion on the photo.
 * Numbers are not range-checked here so one odd dish cannot fail the whole recognition;
 * the server sanitizes them after the schema.
 */
export const recognizedDishSchema = z.object({
  name: z.string().min(1).max(80),
  grams: z.number(),
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  confidence: z.number(),
});
export type RecognizedDish = z.infer<typeof recognizedDishSchema>;

/** An empty `dishes` list is a valid "no food on the photo" answer. */
export const recognitionSchema = z.object({
  dishes: z.array(recognizedDishSchema).max(20),
});
export type Recognition = z.infer<typeof recognitionSchema>;

/** GET /api/ai/status: whether photo recognition and the norm agent can be used; never reveals provider, model or key. */
export const aiStatusSchema = z.object({
  recognition: z.enum(['ready', 'not_configured', 'no_vision']),
  interview: z.enum(['ready', 'not_configured', 'unavailable']),
});
export type AiStatus = z.infer<typeof aiStatusSchema>;
export type RecognitionStatus = AiStatus['recognition'];

export type ConfidenceLevel = 'exact' | 'high' | 'medium' | 'low';

/** Display level of a 0..1 confidence (AC-2.8). */
export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.95) return 'exact';
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}
