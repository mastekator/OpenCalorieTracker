import {
  APICallError,
  generateText,
  Output,
  UnsupportedFunctionalityError,
} from 'ai';
import {
  recognitionSchema,
  round1,
  type Recognition,
  type RecognizedDish,
} from '@oct/shared';
import { ApiError } from '../http/errors.js';
import { callModel, languageName } from './common.js';
import type { AiModel } from './model.js';
import { markNoVision } from './status.js';

/** Bump on every prompt change; it is logged with each call. */
export const RECOGNIZE_PROMPT_VERSION = 1;
export const RECOGNIZE_TIMEOUT_MS = 60_000;

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
  return callModel(
    model,
    {
      op: 'recognize',
      promptVersion: RECOGNIZE_PROMPT_VERSION,
      timeoutMs: RECOGNIZE_TIMEOUT_MS,
      signal,
      mapError: (err, timedOut) =>
        !timedOut && isNoVision(err)
          ? (markNoVision(), new ApiError(409, 'ai_no_vision'))
          : undefined,
      logExtra: (r) => `dishes=${r?.dishes.length ?? 0}`,
    },
    async (abortSignal) => {
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
      return { dishes: output.dishes.map(sanitizeDish) };
    },
  );
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

/** Clamps numbers into sane ranges; a dish with impossible numbers keeps confidence 0 (AC-2.6, E-7.4). */
export function sanitizeDish(d: RecognizedDish): RecognizedDish {
  const numbers = [d.grams, d.kcal, d.proteinG, d.fatG, d.carbsG, d.confidence];
  const finite = numbers.every(Number.isFinite);
  const suspicious = !finite || d.grams <= 0 || d.kcal < 0 || d.kcal > 10_000;
  const safe = (n: number) => (Number.isFinite(n) ? n : 0);
  const amount = (n: number) => Math.max(0, round1(safe(n)));
  return {
    name: d.name,
    grams: Math.min(5000, Math.max(1, Math.round(safe(d.grams)))),
    kcal: amount(d.kcal),
    proteinG: amount(d.proteinG),
    fatG: amount(d.fatG),
    carbsG: amount(d.carbsG),
    confidence: suspicious ? 0 : Math.min(1, Math.max(0, d.confidence)),
  };
}
