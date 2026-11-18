import { APICallError, UnsupportedFunctionalityError } from 'ai';
import type { AiProviderState, AiStatus, RecognitionStatus } from '@oct/shared';
import type { AiModel } from './model.js';

// The model the app serves now (ADR-0018 §3); results of any other model are ignored.
let active: AiModel | null = null;
// Learned from the first failed call (ADR-0007); kept until the active model changes.
let vision = true;

export function markNoVision(model: AiModel) {
  if (model === active) vision = false;
}

export function recognitionStatus(model: AiModel | null): RecognitionStatus {
  if (!model) return 'not_configured';
  return vision ? 'ready' : 'no_vision';
}

// shortcut: detected by the provider's 400 error text; add env AI_VISION=true|false if this misfires.
export function isNoVision(err: unknown) {
  if (UnsupportedFunctionalityError.isInstance(err)) return true;
  return (
    APICallError.isInstance(err) &&
    err.statusCode === 400 &&
    /image|vision|multimodal/i.test(`${err.message} ${err.responseBody ?? ''}`)
  );
}

interface AiResult {
  state: AiProviderState;
  checkedAt: number | null;
  /** Raw provider text: pass through redactSecrets before it leaves the server. */
  details?: { status?: number; message?: string; timeoutSec?: number };
}

// The last real provider call of the active model (ADR-0013); a restart forgets it (E-6.1).
let last: AiResult | undefined;

/** Starts a fresh status and no-vision flag for the new active model (ADR-0018 §3). */
export function setActiveModel(model: AiModel | null) {
  active = model;
  last = undefined;
  vision = true;
}

/**
 * Called after every provider call: no error on success, the error on failure; timeoutMs when
 * the call ran out of time. A late result of a replaced model is dropped.
 */
export function recordAiResult(
  model: AiModel,
  err?: unknown,
  timeoutMs?: number,
) {
  if (model !== active) return;
  if (err === undefined) {
    last = { state: 'ok', checkedAt: Date.now() };
    return;
  }
  if (timeoutMs) {
    last = {
      state: 'timeout',
      checkedAt: Date.now(),
      details: { timeoutSec: Math.round(timeoutMs / 1000) },
    };
    return;
  }
  const status = APICallError.isInstance(err) ? err.statusCode : undefined;
  last = {
    state:
      status === 401 || status === 403
        ? 'auth_error'
        : // Unknown or retired model id; also a wrong AI_BASE_URL path on openai-compatible.
          status === 404
          ? 'model_not_found'
          : status === 429
            ? 'quota_exceeded'
            : isNoVision(err)
              ? 'no_vision'
              : 'unavailable',
    checkedAt: Date.now(),
    details: { status, message: (err as Error)?.message },
  };
}

export function providerState(model: AiModel | null): AiResult {
  if (!model) return { state: 'not_configured', checkedAt: null };
  return last ?? { state: 'unknown', checkedAt: null };
}

export function interviewStatus(model: AiModel | null): AiStatus['interview'] {
  const { state } = providerState(model);
  if (state === 'not_configured') return 'not_configured';
  return [
    'auth_error',
    'quota_exceeded',
    'unavailable',
    'model_not_found',
    'timeout',
  ].includes(state)
    ? 'unavailable'
    : 'ready';
}

/** Cuts the key and typical credentials out of a provider message, then caps it at 500 chars. */
export function redactSecrets(message: string, apiKey: string | undefined) {
  let s = apiKey ? message.replaceAll(apiKey, '[redacted]') : message;
  s = s
    .replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [redacted]')
    .replace(/key=[^\s&"',;]+/gi, 'key=[redacted]');
  return s.slice(0, 500);
}
