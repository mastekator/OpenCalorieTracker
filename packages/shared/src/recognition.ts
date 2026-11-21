import { z } from 'zod';
import { barcodeLookupSchema } from './barcodes/barcodes.js';

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
  /** Refine mode only: id of the input dish this one replaces, null for a new dish (ADR-0020 §3). */
  ref: z.string().nullable().optional(),
});
export type RecognizedDish = z.infer<typeof recognizedDishSchema>;

/**
 * A question about one dish with ready answers (ADR-0020 §4). `dish` and `guess` are indexes into
 * the answer's dishes and `options`. No length or count limits here, as with dishes: the server drops
 * bad questions after the schema.
 */
export const aiQuestionSchema = z.object({
  dish: z.number(),
  text: z.string(),
  guess: z.number(),
  options: z.array(
    z.object({
      label: z.string(),
      name: z.string(),
      grams: z.number(),
      kcal: z.number(),
      proteinG: z.number(),
      fatG: z.number(),
      carbsG: z.number(),
      /** From the model: the name of one of the user's recipes this option is (ADR-0035 §5). */
      recipe: z.string().nullable().optional(),
      /** From the server: the matched recipe; the option's numbers are then unused. */
      recipeId: z.number().optional(),
    }),
  ),
});
export type AiQuestion = z.infer<typeof aiQuestionSchema>;

/** An empty `dishes` list is a valid "no food on the photo" answer. The server always sends `questions`. */
export const recognitionSchema = z.object({
  dishes: z.array(recognizedDishSchema).max(20),
  questions: z.array(aiQuestionSchema).optional(),
});
export type Recognition = z.infer<typeof recognitionSchema>;

const packageHints = {
  /** The code from the `<barcodes>` tag this dish is the package of; the server nulls any other. */
  barcode: z.string().nullable().optional(),
  /** The numbers were read from the package's nutrition table. */
  label: z.boolean().optional(),
};

/** A dish as the model returns it in recognition (ADR-0034 §2, ADR-0036 §1); refine keeps the plain dish. */
export const packageModelDishSchema = recognizedDishSchema.extend({
  ...packageHints,
  /** The digits printed under the barcode lines, read off the photo; the server keeps them only when they differ from every tag code. */
  printedBarcode: z.string().nullable().optional(),
});
export type PackageModelDish = z.infer<typeof packageModelDishSchema>;

/** What the model returns in recognition. */
export const packageModelSchema = recognitionSchema.extend({
  dishes: z.array(packageModelDishSchema).max(20),
});
export type PackageModelRecognition = z.infer<typeof packageModelSchema>;

/** A recognized dish in the response, with the package hints (ADR-0034 §2). */
export const packageDishSchema = recognizedDishSchema.extend({
  ...packageHints,
  /** The printed digits that differ from the decoder's code, looked up by the server (ADR-0036 §3). */
  printed: z
    .object({ code: z.string(), result: barcodeLookupSchema })
    .optional(),
});
export type PackageDish = z.infer<typeof packageDishSchema>;

/** POST /api/photos/:id/recognize: dishes may carry the package hints. */
export const packageRecognitionSchema = recognitionSchema.extend({
  dishes: z.array(packageDishSchema).max(20),
});
export type PackageRecognition = z.infer<typeof packageRecognitionSchema>;

/** GET /api/ai/status for every user: what AI features can be used and where data goes; never the model, state or key. */
export const aiStatusSchema = z.object({
  recognition: z.enum(['ready', 'not_configured', 'no_vision']),
  interview: z.enum(['ready', 'not_configured', 'unavailable']),
  providerName: z.string().nullable(),
  /** Set for an OpenAI-compatible server only (ADR-0013). */
  baseUrlHost: z.string().nullable(),
  /** Refinements per meal per edit session; null without a limit (ADR-0020 §6). */
  refineLimit: z.number().int().nullable(),
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
