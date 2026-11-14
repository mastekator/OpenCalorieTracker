import { rm } from 'node:fs/promises';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { photoPath } from '../photos/store.js';
import { aiSetup, apiError, mockModel, reply } from '../test/ai.js';

const egg = {
  name: 'Egg',
  grams: 50,
  kcal: 78,
  proteinG: 6.3,
  fatG: 5.3,
  carbsG: 0.6,
  confidence: 0.96,
};

let cleanup: (() => Promise<void>) | undefined;
const setup = async (model: Parameters<typeof aiSetup>[0]) => {
  const t = await aiSetup(model);
  cleanup = t.cleanup;
  return t;
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup?.();
  cleanup = undefined;
});

/** A model whose first call waits for `release`, then answers with an egg. */
function gatedModel() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const signals: AbortSignal[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async ({ abortSignal }) => {
      signals.push(abortSignal!);
      await gate;
      return reply({ dishes: [egg] });
    },
  });
  return { model, release, signals };
}

describe('GET /api/ai/status', () => {
  it('is not_configured without a model and ready with one', async () => {
    expect(await (await setup(null)).status()).toEqual({
      recognition: 'not_configured',
      interview: 'not_configured',
      providerName: null,
      baseUrlHost: null,
    });
    await cleanup!();
    expect(await (await setup(mockModel())).status()).toEqual({
      recognition: 'ready',
      interview: 'ready',
      providerName: null,
      baseUrlHost: null,
    });
  });

  it('needs a session', async () => {
    const t = await setup(null);
    expect((await t.app.request('/api/ai/status')).status).toBe(401);
  });
});

describe('POST /api/photos/:id/recognize', () => {
  it('returns the sanitized recognition', async () => {
    const t = await setup(mockModel({ dishes: [{ ...egg, grams: 50.4 }] }));
    const res = await t.recognize(await t.upload());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ dishes: [egg] });
  });

  it('is 409 ai_not_configured without a model (AC-6.6)', async () => {
    const t = await setup(null);
    const res = await t.recognize(await t.upload());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'ai_not_configured' } });
  });

  it.each([
    [apiError(429, 'quota text from provider'), 429, 'ai_quota_exceeded'],
    [apiError(500, 'stack trace from provider'), 503, 'ai_unavailable'],
    [{ dishes: 'nope' }, 502, 'ai_invalid_response'],
  ])(
    'maps a provider failure to %#: %i %s without its text (AC-6.1, AC-6.2)',
    async (failure, status, code) => {
      const t = await setup(mockModel(failure, failure));
      const res = await t.recognize(await t.upload());
      expect(res.status).toBe(status);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: { code } });
      expect(text).not.toMatch(/provider/);
    },
  );

  it("is 404 for another user's, a missing or a malformed photo", async () => {
    const t = await setup(mockModel({ dishes: [egg] }));
    const id = await t.upload();
    const other = await t.signIn('b@example.com');
    expect((await t.recognize(id, other)).status).toBe(404);
    expect((await t.recognize('A'.repeat(22))).status).toBe(404);
    expect((await t.recognize('bad')).status).toBe(404);
  });

  it('is 410 photo_expired when only the preview is left', async () => {
    const t = await setup(mockModel({ dishes: [egg] }));
    const id = await t.upload();
    const userId = (
      t.db
        .prepare('SELECT id FROM users WHERE email = ?')
        .get('admin@example.com') as { id: number }
    ).id;
    await rm(photoPath(t.dataDir, userId, id, 'full')!);
    const res = await t.recognize(id);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: { code: 'photo_expired' } });
  });

  it('allows one call per user: another photo gets 429, the same photo joins', async () => {
    const { model, release } = gatedModel();
    const t = await setup(model);
    const [a, b] = [await t.upload(), await t.upload()];
    const first = t.recognize(a);
    await vi.waitFor(() => expect(model.doGenerateCalls).toHaveLength(1));

    const busy = await t.recognize(b);
    expect(busy.status).toBe(429);
    expect(await busy.json()).toEqual({
      error: { code: 'too_many_attempts', details: { retryAfterSec: 5 } },
    });
    // Another user is not affected by this user's lock.
    const other = await t.signIn('b@example.com');
    expect((await t.recognize(a, other)).status).toBe(404);

    const joined = t.recognize(a);
    release();
    expect((await first).status).toBe(200);
    expect(await (await joined).json()).toEqual({ dishes: [egg] });
    expect(model.doGenerateCalls).toHaveLength(1);
    // The lock is released once the call is done.
    expect((await t.recognize(b)).status).toBe(200);
  });

  it('finishes the call after the client leaves and serves the retry from memory', async () => {
    const { model, release, signals } = gatedModel();
    const t = await setup(model);
    const id = await t.upload();
    const client = new AbortController();
    void t.recognize(id, t.cookie, client.signal).catch(() => {});
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    client.abort();
    expect(signals[0]!.aborted).toBe(false);

    release();
    const retry = await t.recognize(id);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ dishes: [egg] });
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('calls the model again after a failure', async () => {
    const model = mockModel(apiError(500), { dishes: [egg] });
    const t = await setup(model);
    const id = await t.upload();
    expect((await t.recognize(id)).status).toBe(503);
    expect((await t.recognize(id)).status).toBe(200);
    expect(model.doGenerateCalls).toHaveLength(2);
  });
});
