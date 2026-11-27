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
  // The flag is the server model's; a user's own key is built per request and never flagged.
  return vision || model !== active ? 'ready' : 'no_vision';
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

export interface AiResult {
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

/** The state a provider call ended in: no error on success; timeoutMs when it ran out of time. */
export function aiResultOf(err?: unknown, timeoutMs?: number): AiResult {
  if (err === undefined) return { state: 'ok', checkedAt: Date.now() };
  if (timeoutMs)
    return {
      state: 'timeout',
      checkedAt: Date.now(),
      details: { timeoutSec: Math.round(timeoutMs / 1000) },
    };
  const status = APICallError.isInstance(err) ? err.statusCode : undefined;
  return {
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

// The last call or check of each user's own key since start (ADR-0031 §2, E-5).
const ownResults = new Map<number, AiResult>();
// Own-key models built for a request, to their user: their results go to that user's status.
const owners = new WeakMap<AiModel, number>();
export const ownResult = (userId: number) => ownResults.get(userId);
export const recordOwnResult = (userId: number, result: AiResult) =>
  ownResults.set(userId, result);
export const forgetOwnResult = (userId: number) => ownResults.delete(userId);
export const markOwnModel = (model: AiModel, userId: number) =>
  owners.set(model, userId);

/**
 * Called after every provider call with the arguments of aiResultOf. An own key's result goes
 * to its user's status; a late result of a replaced server model is dropped.
 */
export function recordAiResult(
  model: AiModel,
  err?: unknown,
  timeoutMs?: number,
) {
  const userId = owners.get(model);
  if (userId !== undefined) ownResults.set(userId, aiResultOf(err, timeoutMs));
  else if (model === active) last = aiResultOf(err, timeoutMs);
}

export function providerState(model: AiModel | null): AiResult {
  if (!model) return { state: 'not_configured', checkedAt: null };
  return last ?? { state: 'unknown', checkedAt: null };
}

export function interviewStatus(model: AiModel | null): AiStatus['interview'] {
  return interviewOf(providerState(model).state);
}

/** Interview availability by the provider state, of the server's model or an own key. */
export function interviewOf(state: AiProviderState): AiStatus['interview'] {
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
