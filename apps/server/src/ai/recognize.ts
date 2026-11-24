import {
  generateText,
  NoObjectGeneratedError,
  Output,
  type LanguageModelUsage,
} from 'ai';
import {
  normalizeGtin,
  packageModelSchema,
  round1,
  type AiQuestion,
  type DishUnit,
  type PackageDish,
  type PackageModelDish,
  type PackageModelRecognition,
  type PackageRecognition,
  type RecognizedDish,
} from '@oct/shared';
import {
  callModel,
  languageName,
  noVisionError,
  quickReasoning,
} from './common.js';
import { EDIBLE_PROMPT, edibleHints } from './edible.js';
import type { AiModel } from './model.js';
import {
  QUESTIONS_PROMPT,
  RECIPES_PROMPT,
  recipesTag,
  sanitizeQuestions,
  type RecipeName,
} from './questions.js';
import type { z } from 'zod';

/** Bump on every prompt change; it is logged with each call. */
export const RECOGNIZE_PROMPT_VERSION = 9;

/** Same rule in the photo and label prompts (OCT-372). */
export const PET_FOOD_RULE =
  'Food for people only; pet food is not food — omit it even if its nutrition table is readable; packaged human food with animals in its picture or name is food.';
/** Same rule in the photo and refine prompts (ADR-0038 §3). */
export const UNIT_RULE =
  'For a drink or a liquid dish in a glass, cup or bottle set "unit" to "ml" and put its volume in millilitres in "grams"; for anything else set "unit" to null.';
export const RECOGNIZE_TIMEOUT_MS = 60_000;

/** A sanitized dish before the server looks up its printed code (ADR-0036 §3). */
export type SanitizedPackageDish = PackageDish & { printedBarcode?: string };

/** Recognition before the server looks up the printed codes (ADR-0036 §3). */
export interface ModelRecognition {
  dishes: SanitizedPackageDish[];
  questions: AiQuestion[];
}

/** Tokens of one recognition, every attempt summed. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export function recognizePrompt(locale: string, hasRecipes = false) {
  return `You estimate nutrition from a meal photo.
List every separate dish or food item visible. Identical items on different plates are separate entries.
For each item estimate the weight of the edible part in grams and the kcal, protein, fat and carbohydrates in grams for that weight (the whole portion, not per 100 g).
${UNIT_RULE}
${EDIBLE_PROMPT}
Write dish names in ${languageName(locale)}.
Confidence is 0..1:
- 0.95 or higher only for countable, unambiguous single items (eggs, a banana, a packaged yogurt, a slice of bread);
- mixed dishes, sauces and oil: at most 0.9;
- blurry, dark or partial photos: below 0.5.
${PET_FOOD_RULE}
If there is no food on the photo, return an empty list.
The message may have a <barcodes> tag with retail barcodes read from packages on the photo.
For a dish that is one of these packages set barcode to its number exactly as listed, otherwise null.
For a package also set printedBarcode to the digits printed under its barcode lines exactly as you read them on the photo — do not copy them from the <barcodes> tag; null if the digits are not legible.
Set label to true only when you read the dish's kcal and nutrients from its package's nutrition table on the photo, otherwise null.
${QUESTIONS_PROMPT}${hasRecipes ? RECIPES_PROMPT : ''}`;
}

/** `?mode=label` (ADR-0034 §2): only the nutrition table of one package. */
export function labelPrompt(locale: string, code: string) {
  return `You read the nutrition table of the package with barcode ${code} on the photo.
Return one dish: the product name in ${languageName(locale)}; grams is one serving if the table states it, otherwise 100;
kcal, protein, fat and carbohydrates in grams for that weight, computed from the table; confidence 1.
${PET_FOOD_RULE}
If the photo has no readable nutrition table or the package is pet food, return an empty list.
Do not ask questions: return an empty questions list.`;
}

/**
 * Recognizes the dishes on a JPEG photo (ADR-0007). One silent retry on a schema mismatch,
 * 60 s for the whole operation. Provider failures become ApiError; aborting `signal`
 * rethrows the abort error as is. `onUsage` gets the tokens of all attempts, failed ones included.
 * `barcodes` read from the photo go to the model in a `<barcodes>` tag (ADR-0034 §2),
 * the user's recipe names in a `<recipes>` tag (ADR-0035 §4).
 */
export function recognizeMeal(
  model: AiModel,
  jpeg: Uint8Array,
  locale: string,
  signal?: AbortSignal,
  onUsage?: (usage: TokenUsage) => void,
  barcodes: string[] = [],
  recipes: RecipeName[] = [],
): Promise<ModelRecognition> {
  const text = [
    barcodes.length ? `<barcodes>${barcodes.join(' ')}</barcodes>` : '',
    recipes.length ? recipesTag(recipes) : '',
  ]
    .filter(Boolean)
    .join('\n');
  return askVision(
    model,
    jpeg,
    {
      op: 'recognize',
      system: recognizePrompt(locale, recipes.length > 0),
      text: text || undefined,
      recipes: recipes.length,
      signal,
      onUsage,
    },
    (output) => {
      // The hints stay on the dishes until the route applies the user's shares (ADR-0039 §3).
      const dishes = output.dishes.map((d) => ({
        ...sanitizePackageDish(d, barcodes),
        ...edibleHints(d),
      }));
      return {
        dishes,
        questions: sanitizeQuestions(
          output.questions,
          dishes,
          undefined,
          recipes,
        ),
      };
    },
  );
}

/** `?mode=label`: one dish with `label: true` from the package's table, or none (ADR-0034 §2). */
export function readLabel(
  model: AiModel,
  jpeg: Uint8Array,
  locale: string,
  code: string,
  signal?: AbortSignal,
): Promise<PackageRecognition & { questions: AiQuestion[] }> {
  return askVision(
    model,
    jpeg,
    {
      op: 'label',
      system: labelPrompt(locale, code),
      text: `<barcodes>${code}</barcodes>`,
      signal,
    },
    (output) => ({
      dishes: output.dishes
        .slice(0, 1)
        .map((d) => ({ ...sanitizeDish(d), barcode: code, label: true })),
      questions: [],
    }),
  );
}

/** One photo to the model with `schema` (default: the meal recognition schema); the shared call path of every photo mode. */
export async function askVision<T extends object, O = PackageModelRecognition>(
  model: AiModel,
  jpeg: Uint8Array,
  opts: {
    op: string;
    system: string;
    schema?: z.ZodType<O>;
    promptVersion?: number;
    /** What is logged after the call; counts only, never content. */
    logExtra?: (r: T | undefined) => string;
    text?: string;
    /** Only the count is logged, never the names (ADR-0035 §4). */
    recipes?: number;
    signal?: AbortSignal;
    onUsage?: (usage: TokenUsage) => void;
  },
  finish: (output: O) => T,
): Promise<T> {
  const total: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const add = (u: LanguageModelUsage | undefined) => {
    total.inputTokens += u?.inputTokens ?? 0;
    total.outputTokens += u?.outputTokens ?? 0;
  };
  try {
    return await callModel(
      model,
      {
        op: opts.op,
        promptVersion: opts.promptVersion ?? RECOGNIZE_PROMPT_VERSION,
        timeoutMs: RECOGNIZE_TIMEOUT_MS,
        signal: opts.signal,
        mapError: noVisionError,
        logExtra:
          opts.logExtra ??
          ((r) => {
            const m = r as ModelRecognition | undefined;
            return `dishes=${m?.dishes.length ?? 0} questions=${m?.questions.length ?? 0} recipes=${opts.recipes ?? 0}`;
          }),
      },
      async (abortSignal) => {
        const result = await generateText({
          model,
          system: opts.system,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'file', data: jpeg, mediaType: 'image/jpeg' },
                ...(opts.text
                  ? [{ type: 'text' as const, text: opts.text }]
                  : []),
              ],
            },
          ],
          output: Output.object({
            schema: (opts.schema ??
              packageModelSchema) as unknown as z.ZodType<O>,
          }),
          maxRetries: 0,
          reasoning: quickReasoning(model),
          abortSignal,
        }).catch((err: unknown) => {
          // A schema mismatch still spent tokens.
          if (NoObjectGeneratedError.isInstance(err)) add(err.usage);
          throw err;
        });
        add(result.usage);
        return finish(result.output);
      },
    );
  } finally {
    opts.onUsage?.(total);
  }
}

/**
 * `sanitizeDish` plus the package hints, set only when present: a barcode not from the tag is dropped;
 * printed digits are kept only when they differ from every tag code (ADR-0036 §2).
 */
export function sanitizePackageDish(
  d: PackageModelDish,
  barcodes: string[],
): SanitizedPackageDish {
  const code = d.barcode ? normalizeGtin(d.barcode) : null;
  const printed = d.printedBarcode ? normalizeGtin(d.printedBarcode) : null;
  return {
    ...sanitizeDish(d),
    ...(code && barcodes.includes(code) && { barcode: code }),
    ...(d.label === true && { label: true }),
    ...(printed && !barcodes.includes(printed) && { printedBarcode: printed }),
  };
}

/** The model's unit, or null when it sent none or garbage. */
export const modelUnit = (u: string | null | undefined): DishUnit | null => {
  const v = u?.trim().toLowerCase();
  return v === 'ml' || v === 'g' ? v : null;
};

/**
 * Clamps numbers into the ranges `mealItemInputSchema` accepts; a dish with impossible numbers
 * keeps confidence 0 (AC-2.6, E-7.4). Cutting grams scales the nutrients too, keeping the density.
 */
export function sanitizeDish(d: RecognizedDish): RecognizedDish & {
  unit: DishUnit;
} {
  const numbers = [d.grams, d.kcal, d.proteinG, d.fatG, d.carbsG, d.confidence];
  const finite = numbers.every(Number.isFinite);
  const suspicious =
    !finite || d.grams <= 0 || d.grams > 5000 || d.kcal < 0 || d.kcal > 10_000;
  const scale = Number.isFinite(d.grams) && d.grams > 5000 ? 5000 / d.grams : 1;
  const safe = (n: number) => (Number.isFinite(n) ? n : 0);
  const amount = (n: number, max: number) =>
    Math.min(max, Math.max(0, round1(safe(n * scale))));
  return {
    name: d.name,
    grams: Math.min(5000, Math.max(1, Math.round(safe(d.grams)))),
    kcal: amount(d.kcal, 10_000),
    proteinG: amount(d.proteinG, 1000),
    fatG: amount(d.fatG, 1000),
    carbsG: amount(d.carbsG, 1000),
    confidence: suspicious ? 0 : Math.min(1, Math.max(0, d.confidence)),
    unit: modelUnit(d.unit) ?? 'g',
  };
}
