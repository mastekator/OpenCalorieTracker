import { APICallError, NoObjectGeneratedError, TypeValidationError } from 'ai';
import { ApiError } from '../http/errors.js';
import type { AiModel } from './model.js';
import { isNoVision, markNoVision, recordAiResult } from './status.js';

/** English name of the user's language for prompts. */
export function languageName(locale: string) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale)!;
  } catch {
    return 'English';
  }
}

export function isSchemaError(err: unknown) {
  return (
    NoObjectGeneratedError.isInstance(err) ||
    TypeValidationError.isInstance(err)
  );
}

/** Provider failure → ADR-0007 code. */
export function toApiError(err: unknown, timedOut: boolean): ApiError {
  if (timedOut) return new ApiError(503, 'ai_unavailable');
  if (isSchemaError(err)) return new ApiError(502, 'ai_invalid_response');
  if (APICallError.isInstance(err) && err.statusCode === 429)
    return new ApiError(429, 'ai_quota_exceeded');
  return new ApiError(503, 'ai_unavailable');
}

/** mapError for calls that send an image: the model refused it (ADR-0007). */
export function noVisionError(err: unknown, timedOut: boolean, model: AiModel) {
  if (timedOut || !isNoVision(err)) return undefined;
  markNoVision(model);
  return new ApiError(409, 'ai_no_vision');
}

/**
 * Least thinking for Gemini: 3.x models think at length by default and miss our timeouts.
 * Other providers keep their default.
 */
export function quickReasoning(model: AiModel) {
  return model.provider.startsWith('google') ? ('minimal' as const) : undefined;
}

/**
 * Error class, provider status and, for a 4xx, the provider's error text (OCT-437): it names the
 * rejected request part. The text is cut and stripped of anything key-like; never user content (AC-6.2).
 */
export function failureNote(err: unknown) {
  let note = ` error=${(err as Error)?.name ?? 'unknown'}`;
  if (!APICallError.isInstance(err) || !err.statusCode) return note;
  note += ` status=${err.statusCode}`;
  // 5xx and 429 bodies say nothing useful; a 4xx body describes our request.
  if (err.statusCode >= 400 && err.statusCode < 500 && err.statusCode !== 429)
    note += ` body=${JSON.stringify(providerText(err.responseBody || err.message))}`;
  return note;
}

/** One line, at most 300 chars, keys and bearer tokens masked. */
export const providerText = (text: string) =>
  text
    .replace(
      /AIza[\w-]{10,}|sk-[\w-]{10,}|(key|token)=[^&\s"]+|Bearer\s+\S+/gi,
      '***',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

interface CallOptions<T> {
  /** Log name: ai.<op>. */
  op: string;
  promptVersion: number;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Operation-specific error, checked before toApiError. */
  mapError?: (
    err: unknown,
    timedOut: boolean,
    model: AiModel,
  ) => ApiError | undefined;
  /** Log fields before result=…; gets undefined on failure. */
  logExtra: (output: T | undefined) => string;
}

/**
 * One model call (ADR-0007): a timeout for the whole operation, one silent retry on a
 * schema mismatch, provider failures become ApiError, aborting `signal` rethrows the
 * abort error as is. Logs one line per call and records the provider state (ADR-0013).
 */
export async function callModel<T>(
  model: AiModel,
  { op, promptVersion, timeoutMs, signal, mapError, logExtra }: CallOptions<T>,
  call: (abortSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  // A timer, not AbortSignal.timeout(): fake timers in tests must be able to fire it.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const abortSignal = signal
    ? AbortSignal.any([signal, timeout.signal])
    : timeout.signal;
  const started = Date.now();
  let result = 'ok';
  let output: T | undefined;
  let failure = '';
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        output = await call(abortSignal);
        recordAiResult(model);
        return output;
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
    const timedOut = timeout.signal.aborted;
    // A schema mismatch means the provider answered: not a provider failure.
    if (!isSchemaError(err))
      recordAiResult(model, err, timedOut ? timeoutMs : undefined);
    const apiError =
      mapError?.(err, timedOut, model) ?? toApiError(err, timedOut);
    // The model test tells a bad key from a flaky provider by it; onError never sends it.
    apiError.cause ??= err;
    if (timedOut) apiError.timedOut = true;
    result = apiError.code;
    throw apiError;
  } finally {
    clearTimeout(timer);
    console.log(
      `ai.${op} provider=${model.provider} model=${model.modelId} prompt=${promptVersion} ms=${Date.now() - started} ${logExtra(output)} result=${result}${failure}`,
    );
  }
}
