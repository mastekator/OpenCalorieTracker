import {
  APICallError,
  generateText,
  Output,
  UnsupportedFunctionalityError,
} from 'ai';
import { z } from 'zod';
import type { Recognition, RecognizedDish } from '@oct/shared';
import { ApiError } from '../http/errors.js';
import {
  failureNote,
  isSchemaError,
  languageName,
  toApiError,
} from './common.js';
import type { AiModel } from './model.js';
import { markNoVision } from './status.js';

/** Bump on every prompt change; it is logged with each call. */
export const RECOGNIZE_PROMPT_VERSION = 1;
export const RECOGNIZE_TIMEOUT_MS = 60_000;

// Mirrors recognitionSchema in @oct/shared: the server imports only its types at runtime.
const recognitionSchema = z.object({
  dishes: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        grams: z.number(),
        kcal: z.number(),
        proteinG: z.number(),
        fatG: z.number(),
        carbsG: z.number(),
        confidence: z.number(),
      }),
    )
    .max(20),
}) satisfies z.ZodType<Recognition>;

export function recognizePrompt(locale: string) {
  return `You estimate nutrition from a meal photo.
List every separate dish or food item visible. Identical items on different plates are separate entries.
For each item estimate the weight of the edible part in grams and the kcal, protein, fat and carbohydrates in grams for that weight (the whole portion, not per 100 g).
Write dish names in ${languageName(locale)}.
Confidence is 0..1:
- 0.95 or higher only for countable, unambiguous single items (eggs, a banana, a packaged yogurt, a slice of bread);
- mixed dishes, sauces and oil: at most 0.9;
- blurry, dark or partial photos: below 0.5.
If there is no food on the photo, return an empty list.`;
}

/**
 * Recognizes the dishes on a JPEG photo (ADR-0007). One silent retry on a schema mismatch,
 * 60 s for the whole operation. Provider failures become ApiError; aborting `signal`
 * rethrows the abort error as is.
 */
export async function recognizeMeal(
  model: AiModel,
  jpeg: Uint8Array,
  locale: string,
  signal?: AbortSignal,
): Promise<Recognition> {
  // A timer, not AbortSignal.timeout(): fake timers in tests must be able to fire it.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), RECOGNIZE_TIMEOUT_MS);
  const abortSignal = signal
    ? AbortSignal.any([signal, timeout.signal])
    : timeout.signal;
  const started = Date.now();
  let result = 'ok';
  let dishes = 0;
  let failure = '';
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        const { output } = await generateText({
          model,
          system: recognizePrompt(locale),
          messages: [
            {
              role: 'user',
              content: [{ type: 'file', data: jpeg, mediaType: 'image/jpeg' }],
            },
          ],
          output: Output.object({ schema: recognitionSchema }),
          maxRetries: 0,
          abortSignal,
        });
        const recognition = { dishes: output.dishes.map(sanitizeDish) };
        dishes = recognition.dishes.length;
        return recognition;
      } catch (err) {
        if (attempt === 1 && isSchemaError(err) && !abortSignal.aborted)
          continue;
        throw err;
      }
    }
  } catch (err) {
    failure = failureNote(err);
    if (signal?.aborted) {
      result = 'aborted';
      throw err;
    }
    const apiError =
      !timeout.signal.aborted && isNoVision(err)
        ? (markNoVision(), new ApiError(409, 'ai_no_vision'))
        : toApiError(err, timeout.signal.aborted);
    result = apiError.code;
    throw apiError;
  } finally {
    clearTimeout(timer);
    console.log(
      `ai.recognize provider=${model.provider} model=${model.modelId} prompt=${RECOGNIZE_PROMPT_VERSION} ms=${Date.now() - started} dishes=${dishes} result=${result}${failure}`,
    );
  }
}

// shortcut: detected by the provider's 400 error text; add env AI_VISION=true|false if this misfires.
function isNoVision(err: unknown) {
  if (UnsupportedFunctionalityError.isInstance(err)) return true;
  return (
    APICallError.isInstance(err) &&
    err.statusCode === 400 &&
    /image|vision|multimodal/i.test(`${err.message} ${err.responseBody ?? ''}`)
  );
}

const round1 = (n: number) => Math.max(0, Math.round(n * 10) / 10);

/** Clamps numbers into sane ranges; a dish with impossible numbers keeps confidence 0 (AC-2.6, E-7.4). */
export function sanitizeDish(d: RecognizedDish): RecognizedDish {
  const numbers = [d.grams, d.kcal, d.proteinG, d.fatG, d.carbsG, d.confidence];
  const finite = numbers.every(Number.isFinite);
  const suspicious = !finite || d.grams <= 0 || d.kcal < 0 || d.kcal > 10_000;
  const safe = (n: number) => (Number.isFinite(n) ? n : 0);
  return {
    name: d.name,
    grams: Math.min(5000, Math.max(1, Math.round(safe(d.grams)))),
    kcal: round1(safe(d.kcal)),
    proteinG: round1(safe(d.proteinG)),
    fatG: round1(safe(d.fatG)),
    carbsG: round1(safe(d.carbsG)),
    confidence: suspicious ? 0 : Math.min(1, Math.max(0, d.confidence)),
  };
}
