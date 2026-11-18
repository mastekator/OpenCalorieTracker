import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModel } from '../ai/model.js';
import { API_KEY_PURPOSE } from '../ai/settings.js';
import { secretsFrom } from '../secrets.js';
import { aiSetup, apiError, mockModel } from '../test/ai.js';

vi.mock('../ai/model.js', () => ({ createModel: vi.fn() }));

const KEY = 'sk-test-SECRET-key-42';
const egg = {
  name: 'Egg',
  grams: 50,
  kcal: 78,
  proteinG: 6.3,
  fatG: 5.3,
  carbsG: 0.6,
  confidence: 0.96,
};
const draft = { provider: 'openai', model: 'gpt-x', apiKey: KEY };

let cleanup: (() => Promise<void>) | undefined;
let log: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

const setup = async (env: Record<string, string> = {}) => {
  const t = await aiSetup(null, env);
  cleanup = t.cleanup;
  const req =
    (method: string, path: string) =>
    (body?: unknown, cookie = t.cookie) =>
      t.app.request(`/api/admin/ai${path}`, {
        method,
        headers: {
          cookie,
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
  const get = async () =>
    (
      await t.app.request('/api/admin/ai', { headers: { cookie: t.cookie } })
    ).json();
  const row = () => t.db.prepare('SELECT * FROM ai_settings').get();
  return {
    ...t,
    put: req('PUT', '/settings'),
    del: req('DELETE', '/settings'),
    check: req('POST', '/check'),
    get,
    row,
  };
};
// Checks share the one-per-10-s limit.
const nextCheck = () => vi.setSystemTime(Date.now() + 10_000);
const logged = () =>
  [...log.mock.calls, ...error.mock.calls].map((c) => c.join(' ')).join('\n');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(createModel).mockReset();
  await cleanup?.();
  cleanup = undefined;
});

describe('PUT /api/admin/ai/settings', () => {
  it('checks, saves sealed, applies without a restart and never shows the key', async () => {
    const t = await setup();
    const model = mockModel('OK', { dishes: [egg] });
    vi.mocked(createModel).mockResolvedValueOnce(model);
    const res = await t.put({ ...draft, rev: null });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(JSON.parse(body)).toMatchObject({
      provider: 'openai',
      model: 'gpt-x',
      source: 'admin',
      keySet: true,
      keyLast4: 'y-42',
      rev: 1,
      state: 'ok',
    });
    expect(createModel).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: KEY, source: 'admin' }),
    );
    const row = t.row() as { api_key_enc: string; updated_by: number };
    expect(row.api_key_enc).toMatch(/^v1\./);
    expect(row.api_key_enc).not.toContain(KEY);
    expect(logged()).toContain(
      '[info] AI settings changed by admin: provider openai, model gpt-x',
    );

    const rec = await t.recognize(await t.upload());
    expect(await rec.json()).toEqual({ dishes: [egg], questions: [] });
    expect(model.doGenerateCalls).toHaveLength(2);
    for (const text of [body, JSON.stringify(await t.get()), logged()])
      expect(text).not.toContain(KEY);
  });

  it('keeps the saved key for another model of the same provider', async () => {
    const t = await setup();
    vi.mocked(createModel).mockImplementation(async () => mockModel('OK'));
    await t.put({ ...draft, rev: null });
    nextCheck();
    const res = await t.put({ provider: 'openai', model: 'gpt-y', rev: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ model: 'gpt-y', rev: 2 });
    expect(createModel).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: 'gpt-y', apiKey: KEY }),
    );
  });

  it('needs a key for another provider or an unreadable saved key', async () => {
    const t = await setup();
    vi.mocked(createModel).mockResolvedValue(mockModel('OK'));
    await t.put({ ...draft, rev: null });
    const other = await t.put({ provider: 'google', model: 'g', rev: 1 });
    expect(other.status).toBe(400);
    expect(await other.json()).toEqual({ error: { code: 'ai_key_required' } });

    const foreign = secretsFrom(randomBytes(32)).seal(KEY, API_KEY_PURPOSE);
    t.db.prepare('UPDATE ai_settings SET api_key_enc = ?').run(foreign);
    const same = await t.put({ provider: 'openai', model: 'gpt-y', rev: 1 });
    expect(same.status).toBe(400);
    expect(createModel).toHaveBeenCalledTimes(1);
  });

  it('saves nothing when the check fails, and the 422 has no key', async () => {
    const t = await setup();
    vi.mocked(createModel).mockResolvedValueOnce(
      mockModel(apiError(401, `invalid key ${KEY}`)),
    );
    const res = await t.put({ ...draft, rev: null });
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({
      error: {
        code: 'ai_check_failed',
        details: { state: 'auth_error', details: { status: 401 } },
      },
    });
    expect(text).not.toContain(KEY);
    expect(logged()).not.toContain(KEY);
    expect(t.row()).toBeUndefined();
    expect(await t.get()).toMatchObject({ state: 'not_configured' });
  });

  it('force saves without a check, state unknown', async () => {
    const t = await setup();
    const model = mockModel();
    vi.mocked(createModel).mockResolvedValueOnce(model);
    const res = await t.put({ ...draft, force: true, rev: null });
    expect(await res.json()).toMatchObject({ state: 'unknown', rev: 1 });
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(t.ai.current()?.model).toBe(model);
  });

  it('is 409 on a stale rev', async () => {
    const t = await setup();
    vi.mocked(createModel).mockResolvedValue(mockModel());
    await t.put({ ...draft, force: true, rev: null });
    const res = await t.put({ ...draft, force: true, rev: null });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: 'ai_settings_changed' },
    });
    expect((await t.put({ ...draft, force: true, rev: 1 })).status).toBe(200);
  });

  it('needs a base URL for openai-compatible, but no key', async () => {
    const t = await setup();
    vi.mocked(createModel).mockResolvedValue(mockModel());
    const local = { provider: 'openai-compatible', model: 'llava', rev: null };
    expect((await t.put({ ...local, force: true })).status).toBe(400);
    const res = await t.put({
      ...local,
      baseUrl: 'http://ollama:11434/v1',
      force: true,
    });
    expect(await res.json()).toMatchObject({
      baseUrlHost: 'ollama:11434',
      keySet: false,
      keyLast4: null,
    });
  });
});

describe('DELETE /api/admin/ai/settings', () => {
  it('turns AI off', async () => {
    const t = await setup();
    vi.mocked(createModel).mockResolvedValue(mockModel());
    await t.put({ ...draft, force: true, rev: null });
    const res = await t.del();
    expect(await res.json()).toMatchObject({
      provider: null,
      rev: null,
      state: 'not_configured',
    });
    expect(t.row()).toBeUndefined();
    expect(t.ai.current()).toBeNull();
    expect(logged()).toContain('[info] AI turned off by admin');
  });
});

describe('POST /api/admin/ai/check with a draft', () => {
  it('checks without saving or touching the active state', async () => {
    const t = await setup();
    vi.mocked(createModel).mockResolvedValue(mockModel());
    await t.put({ ...draft, force: true, rev: null });
    vi.mocked(createModel).mockResolvedValueOnce(
      mockModel(apiError(404, `no model, key=${KEY}`)),
    );
    const res = await t.check({ provider: 'openai', model: 'nope' });
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      state: 'model_not_found',
      checkedAt: expect.any(Number),
      details: { status: 404, message: expect.any(String) },
    });
    expect(text).not.toContain(KEY);
    expect(createModel).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: 'nope', apiKey: KEY }),
    );
    expect(await t.get()).toMatchObject({
      model: 'gpt-x',
      rev: 1,
      state: 'unknown',
    });

    nextCheck();
    vi.mocked(createModel).mockResolvedValueOnce(mockModel('OK'));
    expect(await (await t.check({ ...draft, model: 'b' })).json()).toEqual({
      state: 'ok',
      checkedAt: expect.any(Number),
    });
  });

  it('needs a key with nothing saved and a valid body', async () => {
    const t = await setup();
    const res = await t.check({ provider: 'openai', model: 'gpt-x' });
    expect(await res.json()).toEqual({ error: { code: 'ai_key_required' } });
    expect((await t.check({ provider: 'nope' })).status).toBe(400);
    expect(createModel).not.toHaveBeenCalled();
  });
});

describe('access', () => {
  it('is 409 for PUT and DELETE while AI_* are set', async () => {
    const t = await setup({
      AI_PROVIDER: 'openai',
      AI_MODEL: 'gpt-x',
      AI_API_KEY: KEY,
    });
    for (const res of [await t.put({ ...draft, rev: null }), await t.del()]) {
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: { code: 'ai_env_managed' } });
    }
  });

  it('is 403 for a non-admin on every new route', async () => {
    const t = await setup();
    const user = await t.signIn('b@example.com');
    expect((await t.put({ ...draft, rev: null }, user)).status).toBe(403);
    expect((await t.del(undefined, user)).status).toBe(403);
    expect((await t.check(draft, user)).status).toBe(403);
    expect(createModel).not.toHaveBeenCalled();
  });
});
