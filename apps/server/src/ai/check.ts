import { generateText } from 'ai';
import type { AiDraft } from '@oct/shared';
import { ApiError } from '../http/errors.js';
import { callModel, noVisionError, quickReasoning } from './common.js';
import type { AiModel } from './model.js';
import { listModels, MODELS_TIMEOUT_MS } from './models.js';
import { aiResultOf, redactSecrets, type AiResult } from './status.js';

export const CHECK_INTERVAL_MS = 10_000;
const CHECK_TIMEOUT_MS = 20_000;
// Not 1 as in ADR-0013: OpenAI's Responses API rejects max_output_tokens below 16.
const CHECK_MAX_TOKENS = 16;
// 1×1 transparent PNG.
const PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** The details of a result as they may leave the server: the key and credentials cut out. */
export const redacted = (
  details: AiResult['details'],
  apiKey: string | undefined,
) =>
  details && {
    details: {
      status: details.status,
      timeoutSec: details.timeoutSec,
      message: details.message && redactSecrets(details.message, apiKey),
    },
  };

/**
 * One tiny request with an image, so no_vision is told apart (ADR-0013); the admin's and the users'
 * keys alike. Records the global state only when `model` is the active one.
 */
export async function runCheck(
  model: AiModel,
  apiKey: string | undefined,
): Promise<AiResult> {
  let failure: AiResult | undefined;
  try {
    await callModel(
      model,
      {
        op: 'check',
        promptVersion: 0,
        timeoutMs: CHECK_TIMEOUT_MS,
        secret: apiKey,
        mapError: (err, timedOut, m) => {
          failure = aiResultOf(err, timedOut ? CHECK_TIMEOUT_MS : undefined);
          return noVisionError(err, timedOut, m);
        },
        logExtra: () => '',
      },
      (abortSignal) =>
        generateText({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Reply OK.' },
                { type: 'file', data: PIXEL_PNG, mediaType: 'image/png' },
              ],
            },
          ],
          maxOutputTokens: CHECK_MAX_TOKENS,
          maxRetries: 0,
          reasoning: quickReasoning(model),
          abortSignal,
        }),
    );
  } catch (err) {
    // A check that found a failure is not itself an error: the state says what failed.
    if (!(err instanceof ApiError)) throw err;
    // A schema mismatch still means the provider answered.
    return failure ?? aiResultOf();
  }
  return aiResultOf();
}

/**
 * Key and address of a draft (AC-1.5): without apiKey or baseUrl the saved ones are kept if the
 * provider stays. A saved key goes only to its own address, never to a new one from the draft.
 */
export function draftConnection(
  draft: Pick<AiDraft, 'provider' | 'apiKey' | 'baseUrl'>,
  saved: { provider: string; apiKey?: string; baseUrl?: string } | null,
) {
  const same = saved?.provider === draft.provider;
  const host = (url: string | undefined) => url?.trim().replace(/\/+$/, '');
  const keyFits =
    same && (!draft.baseUrl || host(draft.baseUrl) === host(saved.baseUrl));
  const apiKey = draft.apiKey ?? (keyFits ? saved.apiKey : undefined);
  const compatible = draft.provider === 'openai-compatible';
  const baseUrl = compatible
    ? (draft.baseUrl ?? (same ? saved.baseUrl : undefined))
    : draft.baseUrl;
  if (compatible && !baseUrl) throw new ApiError(400, 'validation_failed');
  // The chatgpt provider signs in instead of a key (ADR-0031 §4).
  if (!apiKey && !compatible && draft.provider !== 'chatgpt')
    throw new ApiError(400, 'ai_key_required');
  return { apiKey, baseUrl };
}

/** Throws one throttle per key: 429 with retryAfterSec. Counted from the start, so a double click never reaches the provider twice. */
export function throttle() {
  const last = new Map<unknown, number>();
  return (key: unknown = null) => {
    const wait = (last.get(key) ?? -Infinity) + CHECK_INTERVAL_MS - Date.now();
    if (wait > 0)
      throw new ApiError(429, 'too_many_attempts', {
        retryAfterSec: Math.ceil(wait / 1000),
      });
    last.set(key, Date.now());
  };
}

/** The provider's model list (ADR-0018 §4); a failure is 502 ai_models_failed with { state, details }. */
export async function fetchModels(args: Parameters<typeof listModels>[0]) {
  try {
    return await listModels(args);
  } catch (err) {
    const timedOut = (err as Error)?.name === 'TimeoutError';
    const { state, details } = aiResultOf(
      err,
      timedOut ? MODELS_TIMEOUT_MS : undefined,
    );
    throw new ApiError(502, 'ai_models_failed', {
      state,
      ...redacted(details, args.apiKey),
    });
  }
}
