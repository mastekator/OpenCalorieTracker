import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAiStatus } from '../ai/status.js';
import { aiSetup, apiError, mockModel } from '../test/ai.js';

const KEY = 'sk-test-SECRET-key-42';
const ENV = {
  AI_PROVIDER: 'openai-compatible',
  AI_MODEL: 'vision-1',
  AI_API_KEY: KEY,
  AI_BASE_URL: 'http://user:pass@llm.local:11434/v1?token=t',
};

let cleanup: (() => Promise<void>) | undefined;
const setup = async (model: Parameters<typeof aiSetup>[0], env = ENV) => {
  const t = await aiSetup(model, env);
  cleanup = t.cleanup;
  const as = (cookie: string) => ({
    get: () => t.app.request('/api/admin/ai', { headers: { cookie } }),
    check: () =>
      t.app.request('/api/admin/ai/check', {
        method: 'POST',
        headers: { cookie, origin: 'http://localhost:3000' },
      }),
  });
  return { ...t, ...as(t.cookie), as };
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetAiStatus();
  await cleanup?.();
  cleanup = undefined;
});

describe('GET /api/admin/ai', () => {
  it('shows the settings and unknown before any request (E-6.1)', async () => {
    const t = await setup(mockModel());
    expect(await (await t.get()).json()).toEqual({
      provider: 'openai-compatible',
      providerName: null,
      model: 'vision-1',
      keySet: true,
      baseUrlHost: 'llm.local:11434',
      source: 'env',
      state: 'unknown',
      checkedAt: null,
    });
  });

  it('is not_configured without a model', async () => {
    const t = await setup(null, {} as typeof ENV);
    expect(await (await t.get()).json()).toMatchObject({
      provider: null,
      keySet: false,
      state: 'not_configured',
    });
    expect((await t.check()).status).toBe(409);
  });

  it('is 403 for a non-admin (AC-6.6)', async () => {
    const t = await setup(mockModel());
    const user = t.as(await t.signIn('b@example.com'));
    expect((await user.get()).status).toBe(403);
    expect((await user.check()).status).toBe(403);
  });
});

describe('POST /api/admin/ai/check', () => {
  it('records ok', async () => {
    const t = await setup(mockModel('OK'), { ...ENV, AI_PROVIDER: 'google' });
    const res = await t.check();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      providerName: 'Google Gemini',
      state: 'ok',
      checkedAt: expect.any(Number),
    });
  });

  it.each([
    [apiError(401, `invalid key ${KEY}`), 'auth_error', 'unavailable'],
    [apiError(429, `quota for Bearer ${KEY}`), 'quota_exceeded', 'unavailable'],
    [apiError(503, `down, key=${KEY}`), 'unavailable', 'unavailable'],
    [apiError(400, 'image input is not supported'), 'no_vision', 'ready'],
  ])(
    'records a failure %#: %s without the key anywhere (AC-6.1, AC-6.5)',
    async (err, state, interview) => {
      const t = await setup(mockModel(err));
      const res = await t.check();
      expect(res.status).toBe(200);
      const texts = [
        await res.text(),
        await (await t.get()).text(),
        JSON.stringify(await t.status()),
      ];
      expect(JSON.parse(texts[0]!)).toMatchObject({
        state,
        details: { status: err.statusCode },
      });
      for (const text of texts) {
        expect(text).not.toContain(KEY);
        expect(text).not.toContain('pass');
      }
      expect(await t.status()).toMatchObject({
        interview,
        providerName: null,
        baseUrlHost: 'llm.local:11434',
      });
    },
  );

  it('allows one check per 10 s, counted from its start', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const model = mockModel('OK', 'OK');
    const t = await setup(model);
    const [a, b] = await Promise.all([t.check(), t.check()]);
    expect([a.status, b.status].sort()).toEqual([200, 429]);
    expect(model.doGenerateCalls).toHaveLength(1);
    const again = await t.check();
    expect(again.status).toBe(429);
    expect(await again.json()).toEqual({
      error: { code: 'too_many_attempts', details: { retryAfterSec: 10 } },
    });
    vi.setSystemTime(Date.now() + 10_000);
    expect((await t.check()).status).toBe(200);
  });
});
