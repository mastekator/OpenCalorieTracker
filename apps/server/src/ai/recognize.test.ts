import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.js';
import { createModel } from './model.js';
import {
  recognizeMeal,
  RECOGNIZE_TIMEOUT_MS,
  sanitizeDish,
} from './recognize.js';
import { getAiSettings } from './settings.js';
import { recognitionStatus } from './status.js';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);
const egg = {
  name: 'Egg',
  grams: 50,
  kcal: 78,
  proteinG: 6.3,
  fatG: 5.3,
  carbsG: 0.6,
  confidence: 0.96,
};

const reply = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage: {
    inputTokens: {
      total: 1,
      noCache: 1,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  },
  warnings: [],
});

const apiError = (statusCode: number, responseBody = '') =>
  new APICallError({
    message: `provider says ${responseBody}`,
    url: 'https://provider.test',
    requestBodyValues: {},
    statusCode,
    responseBody,
  });

const mockModel = (...results: unknown[]) =>
  new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'vision-1',
    doGenerate: vi.fn(async () => {
      const next = results.shift();
      if (next instanceof Error) throw next;
      return reply(next);
    }),
  });

// Never answers; rejects with the abort reason like a real fetch.
const hangingModel = () =>
  new MockLanguageModelV4({
    doGenerate: ({ abortSignal }) =>
      new Promise((_, reject) => {
        const stop = () => reject(abortSignal!.reason);
        if (abortSignal!.aborted) stop();
        else abortSignal!.addEventListener('abort', stop);
      }),
  });

const logs = () => vi.mocked(console.log).mock.calls.map((c) => String(c[0]));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('recognizeMeal', () => {
  it('returns the dishes and logs one line without names or keys', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const model = mockModel({ dishes: [egg] });
    await expect(recognizeMeal(model, jpeg, 'en')).resolves.toEqual({
      dishes: [egg],
    });
    expect(logs()).toEqual([
      expect.stringMatching(
        /^ai\.recognize provider=mock model=vision-1 prompt=1 ms=\d+ dishes=1 result=ok$/,
      ),
    ]);
  });

  it('accepts an empty list (no food)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(
      recognizeMeal(mockModel({ dishes: [] }), jpeg, 'en'),
    ).resolves.toEqual({ dishes: [] });
  });

  it('retries once on a schema mismatch', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const model = mockModel({ dishes: 'nope' }, { dishes: [egg] });
    await expect(recognizeMeal(model, jpeg, 'en')).resolves.toEqual({
      dishes: [egg],
    });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it('fails with ai_invalid_response after two mismatches', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const model = mockModel({ dishes: 'nope' }, { foo: 1 });
    await expect(recognizeMeal(model, jpeg, 'en')).rejects.toMatchObject({
      status: 502,
      code: 'ai_invalid_response',
    });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(logs()[0]).toMatch(/result=ai_invalid_response/);
  });

  it('maps 429 to ai_quota_exceeded without retrying or leaking the text', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const model = mockModel(apiError(429, 'secret-ish quota text'));
    await expect(recognizeMeal(model, jpeg, 'en')).rejects.toMatchObject({
      status: 429,
      code: 'ai_quota_exceeded',
      message: 'ai_quota_exceeded',
    });
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(logs()[0]).toMatch(
      /result=ai_quota_exceeded error=AI_APICallError status=429$/,
    );
  });

  it.each([500, 401])('maps provider %d to ai_unavailable', async (status) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(
      recognizeMeal(mockModel(apiError(status)), jpeg, 'en'),
    ).rejects.toMatchObject({ status: 503, code: 'ai_unavailable' });
  });

  it('times out after 60 s with ai_unavailable', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const model = hangingModel();
    const call = recognizeMeal(model, jpeg, 'en');
    const assertion = expect(call).rejects.toMatchObject({
      status: 503,
      code: 'ai_unavailable',
    });
    await vi.advanceTimersByTimeAsync(RECOGNIZE_TIMEOUT_MS);
    await assertion;
  });

  it('rethrows the abort when the caller aborts', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctrl = new AbortController();
    const model = hangingModel();
    const call = recognizeMeal(model, jpeg, 'en', ctrl.signal);
    ctrl.abort();
    await expect(call).rejects.toMatchObject({ name: 'AbortError' });
    expect(logs()[0]).toMatch(/result=aborted/);
  });

  it('puts the user language into the prompt', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const model = mockModel({ dishes: [] });
    await recognizeMeal(model, jpeg, 'ru', undefined);
    expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain(
      'Write dish names in Russian.',
    );
  });

  it('maps a no-image error to ai_no_vision and remembers it', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const model = mockModel(
      apiError(400, '{"error":"this model does not support image input"}'),
    );
    expect(recognitionStatus(model)).toBe('ready');
    await expect(recognizeMeal(model, jpeg, 'en')).rejects.toMatchObject({
      status: 409,
      code: 'ai_no_vision',
    });
    expect(recognitionStatus(model)).toBe('no_vision');
  });
});

describe('sanitizeDish', () => {
  it('rounds and clamps sane numbers, keeping confidence', () => {
    expect(
      sanitizeDish({
        ...egg,
        grams: 49.6,
        kcal: 78.04,
        fatG: -1,
        confidence: 1.2,
      }),
    ).toEqual({ ...egg, grams: 50, kcal: 78, fatG: 0, confidence: 1 });
    expect(sanitizeDish({ ...egg, grams: 9000 }).grams).toBe(5000);
  });

  it.each([{ grams: 0 }, { grams: -20 }, { kcal: -5 }, { kcal: 12_000 }])(
    'flags impossible numbers %o with confidence 0',
    (bad) => {
      const dish = sanitizeDish({ ...egg, ...bad });
      expect(dish.confidence).toBe(0);
      expect(dish.grams).toBeGreaterThanOrEqual(1);
      expect(dish.kcal).toBeGreaterThanOrEqual(0);
    },
  );
});

describe('settings and model', () => {
  it('is manual mode without a provider', async () => {
    const config = loadConfig({});
    expect(getAiSettings(config)).toBeNull();
    expect(await createModel(getAiSettings(config))).toBeNull();
    expect(recognitionStatus(null)).toBe('not_configured');
  });

  it('turns AI off when the model is missing, without logging the key', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const config = loadConfig({
      AI_PROVIDER: 'google',
      AI_API_KEY: 'sk-secret',
    });
    expect(getAiSettings(config)).toBeNull();
    expect(JSON.stringify(error.mock.calls)).not.toContain('sk-secret');
  });

  it('rejects an unknown provider', () => {
    expect(() => loadConfig({ AI_PROVIDER: 'skynet' })).toThrow(
      /Invalid environment/,
    );
  });

  it.each([
    ['google', 'google'],
    ['openai', 'openai'],
    ['anthropic', 'anthropic'],
    ['openrouter', 'openrouter'],
  ])('creates a %s model lazily', async (provider, expected) => {
    const model = await createModel(
      getAiSettings(
        loadConfig({
          AI_PROVIDER: provider,
          AI_MODEL: 'm-1',
          AI_API_KEY: 'k',
        }),
      ),
    );
    expect(model?.modelId).toBe('m-1');
    expect(model?.provider).toContain(expected);
  });
});
