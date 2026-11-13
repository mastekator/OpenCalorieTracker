import { APICallError, NoObjectGeneratedError, TypeValidationError } from 'ai';
import { ApiError } from '../http/errors.js';

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

/** Error class and provider status for the log line, never the error text (AC-6.2). */
export function failureNote(err: unknown) {
  let note = ` error=${(err as Error)?.name ?? 'unknown'}`;
  if (APICallError.isInstance(err) && err.statusCode)
    note += ` status=${err.statusCode}`;
  return note;
}
