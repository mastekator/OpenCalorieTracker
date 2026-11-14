import { TypeValidationError } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, mockModel } from '../test/ai.js';
import { callModel } from './common.js';
import {
  interviewStatus,
  providerState,
  recordAiResult,
  redactSecrets,
  resetAiStatus,
} from './status.js';

const KEY = 'sk-secret-123';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  resetAiStatus();
});

describe('provider state (ADR-0013)', () => {
  it('starts unknown in a new process and is not_configured without a model (E-6.1)', () => {
    expect(providerState(mockModel())).toEqual({
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
    [apiError(429, 'quota'), 'quota_exceeded', 'unavailable'],
    [apiError(500, 'down'), 'unavailable', 'unavailable'],
    [new TypeError('fetch failed'), 'unavailable', 'unavailable'],
    [apiError(400, 'model does not support image input'), 'no_vision', 'ready'],
  ])('records %s as %s, interview %s', (err, state, interview) => {
    recordAiResult(err);
    expect(providerState(mockModel()).state).toBe(state);
    expect(interviewStatus(mockModel())).toBe(interview);
  });

  it('keeps the status code and message of a failure', () => {
    recordAiResult(apiError(401, 'bad key'));
    expect(providerState(mockModel())).toMatchObject({
      checkedAt: expect.any(Number),
      details: { status: 401, message: 'provider says bad key' },
    });
  });
});

describe('callModel records the result', () => {
  const opts = { op: 't', promptVersion: 1, logExtra: () => '' };

  it('ok on success, the error state on failure', async () => {
    const model = mockModel();
    await callModel(model, { ...opts, timeoutMs: 1000 }, async () => 1);
    expect(providerState(model).state).toBe('ok');
    await expect(
      callModel(model, { ...opts, timeoutMs: 1000 }, async () => {
        throw apiError(429);
      }),
    ).rejects.toThrow();
    expect(providerState(model).state).toBe('quota_exceeded');
  });

  it('unavailable on a timeout', async () => {
    vi.useFakeTimers();
    const model = mockModel();
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
    expect(providerState(model).state).toBe('unavailable');
  });

  it('nothing on a client abort or a schema mismatch', async () => {
    const model = mockModel();
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
