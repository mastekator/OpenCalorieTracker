import { APICallError, TypeValidationError } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, mockModel } from '../test/ai.js';
import { MockLanguageModelV4 } from 'ai/test';
import { callModel, quickReasoning } from './common.js';
import {
  interviewStatus,
  markNoVision,
  providerState,
  recognitionStatus,
  recordAiResult,
  redactSecrets,
  setActiveModel,
} from './status.js';

const KEY = 'sk-secret-123';

const active = mockModel();
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  setActiveModel(active);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('provider state (ADR-0013)', () => {
  it('starts unknown in a new process and is not_configured without a model (E-6.1)', () => {
    expect(providerState(active)).toEqual({
      state: 'unknown',
      checkedAt: null,
    });
    expect(providerState(null).state).toBe('not_configured');
    expect(interviewStatus(null)).toBe('not_configured');
  });

  it.each([
    [undefined, 'ok', 'ready'],
    [apiError(401, 'bad key'), 'auth_error', 'unavailable'],
    [apiError(403, 'forbidden'), 'auth_error', 'unavailable'],
    [apiError(404, 'model not found'), 'model_not_found', 'unavailable'],
    [apiError(429, 'quota'), 'quota_exceeded', 'unavailable'],
    [apiError(500, 'down'), 'unavailable', 'unavailable'],
    [new TypeError('fetch failed'), 'unavailable', 'unavailable'],
    [
      new APICallError({ message: 'x', url: 'u', requestBodyValues: {} }),
      'unavailable',
      'unavailable',
    ],
    [apiError(400, 'model does not support image input'), 'no_vision', 'ready'],
  ])('records %s as %s, interview %s', (err, state, interview) => {
    recordAiResult(active, err);
    expect(providerState(active).state).toBe(state);
    expect(interviewStatus(active)).toBe(interview);
  });

  it('ignores results and no-vision of a model that is not active (ADR-0018 §3)', () => {
    const old = mockModel();
    recordAiResult(active);
    recordAiResult(old, apiError(401, 'bad key'));
    markNoVision(old);
    expect(providerState(active).state).toBe('ok');
    expect(recognitionStatus(active)).toBe('ready');
    setActiveModel(old);
    expect(providerState(old).state).toBe('unknown');
  });

  it('keeps the status code and message of a failure', () => {
    recordAiResult(active, apiError(401, 'bad key'));
    expect(providerState(active)).toMatchObject({
      checkedAt: expect.any(Number),
      details: { status: 401, message: 'provider says bad key' },
    });
  });
});

describe('callModel records the result', () => {
  const opts = { op: 't', promptVersion: 1, logExtra: () => '' };
  const model = active;

  it('ok on success, the error state on failure', async () => {
    await callModel(model, { ...opts, timeoutMs: 1000 }, async () => 1);
    expect(providerState(model).state).toBe('ok');
    await expect(
      callModel(model, { ...opts, timeoutMs: 1000 }, async () => {
        throw apiError(429);
      }),
    ).rejects.toThrow();
    expect(providerState(model).state).toBe('quota_exceeded');
  });

  it('timeout with its seconds when the call runs out of time', async () => {
    vi.useFakeTimers();
    const call = callModel(
      model,
      { ...opts, timeoutMs: 1000 },
      (signal) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason)),
        ),
    );
    const done = expect(call).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    vi.useRealTimers();
    expect(providerState(model)).toMatchObject({
      state: 'timeout',
      details: { timeoutSec: 1 },
    });
    expect(interviewStatus(model)).toBe('unavailable');
  });

  it('nothing on a client abort or a schema mismatch', async () => {
    const client = new AbortController();
    client.abort();
    await expect(
      callModel(
        model,
        { ...opts, timeoutMs: 1000, signal: client.signal },
        async () => {
          throw apiError(500);
        },
      ),
    ).rejects.toThrow();
    await expect(
      callModel(model, { ...opts, timeoutMs: 1000 }, async () => {
        throw new TypeValidationError({ value: 1, cause: 'x' });
      }),
    ).rejects.toThrow();
    expect(providerState(model).state).toBe('unknown');
  });
});

describe('quickReasoning', () => {
  it('asks Gemini for the least thinking, leaves other providers alone', () => {
    expect(
      quickReasoning(
        new MockLanguageModelV4({ provider: 'google.generative-ai' }),
      ),
    ).toBe('minimal');
    expect(quickReasoning(mockModel())).toBeUndefined();
  });
});

describe('redactSecrets', () => {
  it('cuts the key, Bearer tokens and key= params (AC-6.5)', () => {
    expect(
      redactSecrets(
        `Incorrect API key ${KEY}. Authorization: Bearer abc.def; url ?key=AIzaXYZ&x=1 api_key=zzz`,
        KEY,
      ),
    ).toBe(
      'Incorrect API key [redacted]. Authorization: Bearer [redacted]; url ?key=[redacted]&x=1 api_key=[redacted]',
    );
  });

  it('caps the message at 500 chars after redaction', () => {
    const out = redactSecrets('a'.repeat(495) + KEY, KEY);
    expect(out).toHaveLength(500);
    expect(out).not.toContain('sk-');
  });

  it('works without a key', () => {
    expect(redactSecrets('plain', undefined)).toBe('plain');
  });
});
