import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiTestRun } from '@oct/shared';
import { createModel } from '../ai/model.js';
import { readExpected } from '../ai/model-test/compare.js';
import { modelsMdRow } from '../ai/model-test/format.js';
import { createApp } from '../app.js';
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
const meal = { dishes: [egg] };
const draft = { provider: 'openai', model: 'gpt-x', apiKey: KEY };
// The size of the test set, not a fixed 9 (AC-10).
const N = (await readExpected()).photos.length;
const every = () => Array.from({ length: N }, () => meal);

let cleanup: (() => Promise<void>) | undefined;

const setup = async (...args: Parameters<typeof aiSetup>) => {
  const t = await aiSetup(args[0] ?? null, args[1]);
  cleanup = t.cleanup;
  const req = (
    method: string,
    path: string,
    body?: unknown,
    cookie = t.cookie,
  ) =>
    t.app.request(`/api/admin/ai${path}`, {
      method,
      headers: {
        cookie,
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const start = async (body: unknown = draft) => req('POST', '/tests', body);
  const startId = async (body: unknown = draft) => {
    const res = await start(body);
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: number }).id;
  };
  const get = async (id: number) =>
    (await (await req('GET', `/tests/${id}`)).json()) as AiTestRun;
  const finished = (id: number) =>
    vi.waitFor(async () => {
      const run = await get(id);
      expect(run.status).not.toBe('running');
      return run;
    });
  return { ...t, req, start, startId, get, finished };
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(createModel).mockReset();
  await cleanup?.();
  cleanup = undefined;
});

describe('model test', () => {
  it('runs every photo and gives the MODELS.md row', async () => {
    const t = await setup();
    vi.mocked(createModel).mockResolvedValue(mockModel(...every()));
    const run = await t.finished(await t.startId());
    expect(run).toMatchObject({
      provider: 'openai',
      model: 'gpt-x',
      status: 'done',
      stopReason: null,
      total: N,
      inputTokens: N,
      outputTokens: N,
      costUsd: null,
      testSet: 3,
      currentSet: 3,
    });
    expect(run.photos).toHaveLength(N);
    expect(run.photos.every((p) => p.ms !== undefined)).toBe(true);
    expect(run.passed).toBe(run.photos.filter((p) => p.result === 'ok').length);
    expect(run.modelsMdRow).toBe(modelsMdRow(run));
    expect(run.modelsMdRow).toMatch(
      new RegExp(`^\\| openai \\| gpt-x \\| \\d/${N} \\|.*, set 3 \\|$`),
    );
    expect(run.report?.endsWith(run.modelsMdRow!)).toBe(true);

    const list = await (await t.req('GET', '/tests')).json();
    expect(list).toEqual([
      expect.objectContaining({
        id: run.id,
        status: 'done',
        total: N,
        testSet: 3,
        currentSet: 3,
      }),
    ]);
    expect(list[0]).not.toHaveProperty('photos');
    expect(list[0]).not.toHaveProperty('modelsMdRow');
  });

  it('under AI_* in env, tests the current model with the env key', async () => {
    const env = { AI_PROVIDER: 'google', AI_MODEL: 'g', AI_API_KEY: 'env-key' };
    const t = await setup(mockModel(...every()), env);
    const run = await t.finished(
      await t.startId({ provider: 'google', model: 'g' }),
    );
    expect(run.status).toBe('done');
    // The active model itself, not a temporary one (AC-2.13).
    expect(createModel).not.toHaveBeenCalled();
  });

  it('prices an OpenRouter run from its model list', async () => {
    const t = await setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        data: [
          {
            id: 'v/x',
            pricing: { prompt: '0.000001', completion: '0.000002' },
          },
        ],
      }),
    );
    vi.mocked(createModel).mockResolvedValue(mockModel(...every()));
    const run = await t.finished(
      await t.startId({ provider: 'openrouter', model: 'v/x', apiKey: KEY }),
    );
    // N tokens in at $1/M, N out at $2/M.
    expect(run.costUsd).toBeCloseTo(3 * N * 1e-6, 12);
  });

  it('stops early on 401, the rest not run', async () => {
    const t = await setup();
    vi.mocked(createModel).mockResolvedValue(
      mockModel(meal, apiError(401, `bad key ${KEY}`)),
    );
    const run = await t.finished(await t.startId());
    expect(run).toMatchObject({ status: 'stopped', stopReason: 'auth_error' });
    expect(run.photos[1]!.result).toBe('error ai_unavailable');
    expect(run.photos.slice(2).map((p) => p.result)).toEqual(
      Array(N - 2).fill('not_run'),
    );
    expect(run.modelsMdRow).toBeUndefined();
    expect(run.report).toBeUndefined();
  });

  it('goes on after a timeout or a bad answer on one photo', async () => {
    const t = await setup();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const model = mockModel(apiError(500), ...every());
    const generate = model.doGenerate;
    let calls = 0;
    // The second photo hangs until the 60 s timeout aborts it.
    model.doGenerate = (opts) =>
      ++calls === 2
        ? new Promise((_, reject) =>
            opts.abortSignal!.addEventListener('abort', () =>
              reject(opts.abortSignal!.reason),
            ),
          )
        : generate(opts);
    vi.mocked(createModel).mockResolvedValue(model);
    const id = await t.startId();
    await vi.waitFor(() => expect(calls).toBe(2));
    await vi.advanceTimersByTimeAsync(60_000);
    const run = await t.finished(id);
    expect(run.status).toBe('done');
    expect(run.photos.slice(0, 2).map((p) => p.result)).toEqual([
      'error ai_unavailable',
      'error ai_unavailable',
    ]);
    expect(run.photos[2]!.result).not.toMatch(/error|not_run/);
  });

  it('stops on request', async () => {
    const t = await setup();
    const model = mockModel();
    // Each call hangs until it is aborted.
    model.doGenerate = (opts) =>
      new Promise((_, reject) =>
        opts.abortSignal!.addEventListener('abort', () =>
          reject(opts.abortSignal!.reason),
        ),
      );
    vi.mocked(createModel).mockResolvedValue(model);
    const id = await t.startId();
    expect((await t.req('DELETE', `/tests/${id}`)).status).toBe(409);
    expect((await t.req('POST', `/tests/${id}/stop`)).status).toBe(204);
    const run = await t.finished(id);
    expect(run).toMatchObject({ status: 'stopped', stopReason: 'user' });
    expect(run.photos.every((p) => p.result === 'not_run')).toBe(true);
    expect((await t.req('POST', '/tests/999/stop')).status).toBe(404);
  });

  it('runs one at a time and 10 an hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t = await setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const model = mockModel(...Array.from({ length: 99 }, () => meal));
    const generate = model.doGenerate;
    model.doGenerate = async (opts) => {
      await gate;
      return generate(opts);
    };
    vi.mocked(createModel).mockResolvedValue(model);
    // Two starts at once: one wins, the other is refused.
    const [a, b] = await Promise.all([t.start(), t.start()]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const first = ((await (a.status === 201 ? a : b).json()) as { id: number })
      .id;
    const busy = await t.start();
    expect(busy.status).toBe(409);
    expect(await busy.json()).toEqual({
      error: { code: 'ai_test_running', details: { id: first } },
    });
    release();
    await t.finished(first);
    // The refused start spent no attempt: 9 more fit.
    for (let i = 0; i < 9; i++) {
      vi.setSystemTime(Date.now() + 60_000);
      await t.finished(await t.startId());
    }
    const limited = await t.start();
    expect(limited.status).toBe(429);
    // The first start was 9 minutes ago, plus what waitFor advanced the fake clock by.
    const { error } = await limited.json();
    expect(error.code).toBe('too_many_attempts');
    expect(error.details.retryAfterSec).toBeGreaterThan(50 * 60);
    expect(error.details.retryAfterSec).toBeLessThanOrEqual(51 * 60);
    vi.setSystemTime(Date.now() + 51 * 60_000);
    await t.finished(await t.startId());
  });

  it('keeps its model when new settings are saved mid-run (E-3)', async () => {
    const t = await setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const a = mockModel('OK', ...every());
    const generate = a.doGenerate;
    a.doGenerate = async (opts) => {
      if (a.doGenerateCalls.length > 1) await gate;
      return generate(opts);
    };
    const b = mockModel('OK');
    vi.mocked(createModel).mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    const put = (body: unknown) => t.req('PUT', '/settings', body);
    expect((await put({ ...draft, rev: null })).status).toBe(200);
    // The saved settings without a key: the active model, no new one built.
    const id = await t.startId({ provider: 'openai', model: 'gpt-x' });
    expect(createModel).toHaveBeenCalledTimes(1);
    expect(
      (await put({ ...draft, model: 'gpt-y', rev: 1, force: true })).status,
    ).toBe(200);
    release();
    await t.finished(id);
    expect(a.doGenerateCalls).toHaveLength(N + 1);
    expect(b.doGenerateCalls).toHaveLength(0);
  });

  it('tests a draft without touching the AI status or keeping its key', async () => {
    const t = await setup();
    vi.mocked(createModel)
      .mockResolvedValueOnce(mockModel('OK'))
      .mockResolvedValueOnce(mockModel(apiError(401, `bad ${KEY}`)));
    await t.req('PUT', '/settings', {
      provider: 'google',
      model: 'g',
      apiKey: 'g-key-1234',
      rev: null,
    });
    const before = await (await t.req('GET', '')).json();
    const res = await t.start();
    const id = ((await res.json()) as { id: number }).id;
    const run = await t.finished(id);
    expect(run.stopReason).toBe('auth_error');
    expect(await (await t.req('GET', '')).json()).toEqual(before);
    const stored = JSON.stringify(
      t.db.prepare('SELECT * FROM ai_test_runs').all(),
    );
    const list = await (await t.req('GET', '/tests')).text();
    for (const text of [stored, list, JSON.stringify(run)])
      expect(text).not.toContain(KEY);
  });

  it('marks a run cut by a restart interrupted and keeps the newest 20', async () => {
    const t = await setup();
    const insert = t.db.prepare(
      `INSERT INTO ai_test_runs (provider, model, status, app_version, prompt_version, started_at, photos)
       VALUES ('openai', 'old', ?, '0.1.0', 1, 0, ?)`,
    );
    insert.run('done', '[]');
    for (let i = 0; i < 18; i++) insert.run('done', '[]');
    insert.run(
      'running',
      JSON.stringify([{ file: 'a.jpg', expected: '', result: 'pending' }]),
    );
    createApp({ config: t.config, db: t.db, ai: t.ai, secrets: t.secrets });
    const cut = await t.get(20);
    expect(cut.status).toBe('interrupted');
    // A run from before the column is set 1 (ADR-0033 §4).
    expect(cut).toMatchObject({ testSet: 1, currentSet: 3 });
    expect(cut.photos[0]!.result).toBe('not_run');
    expect(cut.modelsMdRow).toBeUndefined();

    vi.mocked(createModel).mockResolvedValue(mockModel(...every()));
    await t.finished(await t.startId());
    const ids = t.db
      .prepare('SELECT id FROM ai_test_runs ORDER BY id')
      .pluck()
      .all();
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe(2);

    expect((await t.req('DELETE', '/tests/2')).status).toBe(204);
    expect((await t.req('DELETE', '/tests/2')).status).toBe(404);
    expect((await t.req('DELETE', '/tests')).status).toBe(204);
    expect(await (await t.req('GET', '/tests')).json()).toEqual([]);
  });

  it('answers 403 to a non-admin', async () => {
    const t = await setup();
    const cookie = await t.signIn('b@example.com');
    expect((await t.req('GET', '/tests', undefined, cookie)).status).toBe(403);
    expect((await t.req('POST', '/tests', draft, cookie)).status).toBe(403);
  });
});
