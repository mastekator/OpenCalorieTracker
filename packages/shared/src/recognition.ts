import { z } from 'zod';
import { barcodeLookupSchema } from './barcodes/barcodes.js';

/** Gross weight → edible share the server applied, and where the share came from (ADR-0039 §3). */
export const edibleSchema = z.object({
  grossG: z.number(),
  pct: z.number(),
  source: z.enum(['user', 'ref', 'ai']),
  /** Reference key, or `nameKey(name)` outside the reference; the key to remember a chosen share by. */
  key: z.string(),
});
export type Edible = z.infer<typeof edibleSchema>;

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
  /** 'ml' for drinks (ADR-0038 §3); loose so one odd value cannot fail the answer, the server narrows it. */
  unit: z.string().nullable().optional(),
  /** From the model (ADR-0039 §2): a read gross weight, a reference key, its own edible share. Loose; the server narrows them. */
  grossG: z.number().nullable().optional(),
  edibleRef: z.string().nullable().optional(),
  ediblePct: z.number().nullable().optional(),
  /** From the server: the gross weight and the edible share `grams` was computed from. */
  edible: edibleSchema.optional(),
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
      /** From the server: the share this option of «How much is edible?» applies. */
      edible: edibleSchema.optional(),
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

/*
 * What the model is asked to return (OCT-437). Every field is required, "none" is null:
 * Gemini rejects a response schema with many optional and nullable fields with a 400.
 * The server turns nulls into absent fields; the API schemas above and below stay as they are.
 */
/** Required and nullable in the JSON schema; a field the model still leaves out parses as null. */
export const orNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => v ?? null, schema.nullable());

/** A length bound checked after parsing, left out of the JSON schema: Gemini turns length limits into too many states (OCT-525). */
export const lengthIn = (min: number, max: number) => (v: { length: number }) =>
  v.length >= min && v.length <= max;

const looseNumber = z.preprocess(
  (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null),
  z.number().nullable(),
);

const modelDish = {
  name: z.string().refine(lengthIn(1, 80)),
  grams: z.number(),
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  confidence: z.number(),
  /** 'ml' for drinks (ADR-0038 §3). */
  // An odd unit becomes null rather than failing the whole answer.
  unit: z.preprocess(
    (v) =>
      typeof v === 'string' && /^(g|ml)$/i.test(v.trim())
        ? v.trim().toLowerCase()
        : null,
    z.enum(['g', 'ml']).nullable(),
  ),
  // ADR-0039 §2: garbage becomes null rather than failing the whole answer.
  grossG: looseNumber,
  edibleRef: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? v.trim() : null),
    z.string().nullable(),
  ),
  ediblePct: looseNumber,
};

const modelQuestionSchema = z.object({
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
      /** The name of one of the user's recipes this option is (ADR-0035 §5). */
      recipe: orNull(z.string()),
    }),
  ),
});

// A missing list is an empty one.
const modelQuestions = z.preprocess(
  (v) => v ?? [],
  z.array(modelQuestionSchema),
);

/** What the model returns in refine (ADR-0020 §3): `ref` is the id of the input dish, null for a new one. */
export const refineModelSchema = z.object({
  dishes: z
    .array(z.object({ ...modelDish, ref: orNull(z.string()) }))
    .refine(lengthIn(0, 20)),
  questions: modelQuestions,
});

/** A dish as the model returns it in recognition and label reading (ADR-0034 §2, ADR-0036 §1). */
export const packageModelDishSchema = z.object({
  ...modelDish,
  /** The code from the `<barcodes>` tag this dish is the package of. */
  barcode: orNull(z.string()),
  /** The numbers were read from the package's nutrition table. */
  label: orNull(z.boolean()),
  /** The digits printed under the barcode lines, read off the photo; the server keeps them only when they differ from every tag code. */
  printedBarcode: orNull(z.string()),
});
export type PackageModelDish = z.infer<typeof packageModelDishSchema>;

/** What the model returns in recognition. */
export const packageModelSchema = z.object({
  dishes: z.array(packageModelDishSchema).refine(lengthIn(0, 20)),
  questions: modelQuestions,
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
