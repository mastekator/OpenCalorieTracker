import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefineRequest } from '@oct/shared';
import { photoPath } from '../photos/store.js';
import { REFINE_TIMEOUT_MS } from './refine.js';
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
const dishIn = { id: 'd1', ...egg, confidence: undefined, fixed: [] };

let cleanup: (() => Promise<void>) | undefined;
async function setup(model: Parameters<typeof aiSetup>[0]) {
  const t = await aiSetup(model);
  cleanup = t.cleanup;
  const refine = (
    over: Partial<RefineRequest> = {},
    as = t.cookie,
    signal?: AbortSignal,
  ) =>
    t.app.request('/api/ai/refine', {
      method: 'POST',
      headers: {
        cookie: as,
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'refine',
        requestId: randomUUID(),
        sessionId: randomUUID(),
        text: 'it was 100 g',
        dishes: [dishIn],
        ...over,
      }),
      signal,
    });
  const expire = async (id: string) => {
    const { id: userId } = t.db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get('admin@example.com') as { id: number };
    await rm(photoPath(t.dataDir, userId, id, 'full')!);
  };
  return { ...t, refine, expire };
}

const sentPhoto = (model: MockLanguageModelV4, call: number) =>
  JSON.stringify(model.doGenerateCalls[call]!.prompt).includes('"type":"file"');

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup?.();
  cleanup = undefined;
});

it('refines by text and with the photo, answering left: null', async () => {
  const model = mockModel(
    { dishes: [{ ...egg, grams: 100, ref: 'd1' }] },
    { dishes: [{ ...egg, ref: 'd1' }] },
  );
  const t = await setup(model);
  const res = await t.refine();
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    dishes: [{ name: 'Egg', grams: 100, ref: 'd1' }],
    questions: [],
    left: null,
  });
  expect(sentPhoto(model, 0)).toBe(false);

  expect((await t.refine({ photoId: await t.upload() })).status).toBe(200);
  expect(sentPhoto(model, 1)).toBe(true);
});

it('recognizes again with the photo; it needs a photoId', async () => {
  const model = mockModel({ dishes: [egg] });
  const t = await setup(model);
  const bad = await t.refine({ mode: 'again', text: '' });
  expect(bad.status).toBe(400);
  expect(await bad.json()).toMatchObject({
    error: { code: 'validation_failed' },
  });

  const res = await t.refine({
    mode: 'again',
    text: '',
    photoId: await t.upload(),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    dishes: [{ name: 'Egg' }],
    left: null,
  });
  expect(sentPhoto(model, 0)).toBe(true);
});

it('with an expired photo: again is 410, refine goes by text', async () => {
  const model = mockModel({ dishes: [egg] });
  const t = await setup(model);
  const id = await t.upload();
  await t.expire(id);
  const again = await t.refine({ mode: 'again', photoId: id });
  expect(again.status).toBe(410);
  expect(await again.json()).toEqual({ error: { code: 'photo_expired' } });

  expect((await t.refine({ photoId: id })).status).toBe(200);
  expect(model.doGenerateCalls).toHaveLength(1);
  expect(sentPhoto(model, 0)).toBe(false);
});

it('learns no_vision from a refine with the photo, then refines by text and refuses again', async () => {
  const model = mockModel(
    apiError(400, 'this model does not support image input'),
    { dishes: [egg] },
  );
  const t = await setup(model);
  const id = await t.upload();
  const first = await t.refine({ photoId: id });
  expect(first.status).toBe(409);
  expect(await first.json()).toEqual({ error: { code: 'ai_no_vision' } });

  expect((await t.refine({ photoId: id })).status).toBe(200);
  expect(sentPhoto(model, 1)).toBe(false);

  const again = await t.refine({ mode: 'again', photoId: id });
  expect(again.status).toBe(409);
  expect(model.doGenerateCalls).toHaveLength(2);
});

it("is 404 for another user's or a missing photo in both modes", async () => {
  const model = mockModel();
  const t = await setup(model);
  const id = await t.upload();
  const other = await t.signIn('b@example.com');
  for (const mode of ['again', 'refine'] as const) {
    expect((await t.refine({ mode, photoId: id }, other)).status).toBe(404);
    expect((await t.refine({ mode, photoId: 'A'.repeat(22) })).status).toBe(
      404,
    );
  }
  expect(model.doGenerateCalls).toHaveLength(0);
});

it('is 409 ai_not_configured without a model and 401 without a session', async () => {
  const t = await setup(null);
  const res = await t.refine();
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: { code: 'ai_not_configured' } });
  expect((await t.refine({}, '')).status).toBe(401);
});

it('is 422 ai_empty_result for an empty list and calls the model again on retry', async () => {
  const model = mockModel({ dishes: [] }, { dishes: [egg] });
  const t = await setup(model);
  const requestId = randomUUID();
  const res = await t.refine({ requestId });
  expect(res.status).toBe(422);
  expect(await res.json()).toEqual({ error: { code: 'ai_empty_result' } });
  // The lock is released and the failure is not cached.
  expect((await t.refine({ requestId })).status).toBe(200);
  expect(model.doGenerateCalls).toHaveLength(2);
});

it('shares the one-call lock with recognize, survives a dropped client and serves the retry from memory', async () => {
  // Each call waits for its own release.
  const releases: (() => void)[] = [];
  const gates = [0, 1].map(() => new Promise<void>((r) => releases.push(r)));
  const signals: AbortSignal[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async ({ abortSignal }) => {
      signals.push(abortSignal!);
      await gates[signals.length - 1];
      return reply({ dishes: [egg] });
    },
  });
  const t = await setup(model);
  const id = await t.upload();
  const recognizing = t.recognize(id);
  await vi.waitFor(() => expect(signals).toHaveLength(1));
  const busy = await t.refine();
  expect(busy.status).toBe(429);
  expect(await busy.json()).toEqual({
    error: { code: 'too_many_attempts', details: { retryAfterSec: 5 } },
  });
  releases[0]!();
  expect((await recognizing).status).toBe(200);

  const requestId = randomUUID();
  const client = new AbortController();
  void t.refine({ requestId }, t.cookie, client.signal).catch(() => {});
  await vi.waitFor(() => expect(signals).toHaveLength(2));
  client.abort();
  expect(signals[1]!.aborted).toBe(false);
  // A recognize while refine runs is refused too.
  expect((await t.recognize(await t.upload())).status).toBe(429);

  const retry = t.refine({ requestId });
  releases[1]!();
  expect((await retry).status).toBe(200);
  expect(await (await retry).json()).toMatchObject({
    dishes: [{ name: 'Egg' }],
    left: null,
  });
  expect(model.doGenerateCalls).toHaveLength(2);
});

describe('refine limit per session', () => {
  const setLimit = (t: Awaited<ReturnType<typeof setup>>, n: number | null) =>
    t.db
      .prepare(
        'INSERT OR REPLACE INTO ai_limits (id, refine_per_session) VALUES (1, ?)',
      )
      .run(n);

  it('with limit 2 refuses the third request with 429, then counts a new session afresh', async () => {
    const model = mockModel(
      ...Array.from({ length: 4 }, () => ({ dishes: [egg] })),
    );
    const t = await setup(model);
    setLimit(t, 2);
    const sessionId = randomUUID();
    const lefts = [];
    for (let i = 0; i < 2; i++)
      lefts.push(
        ((await (await t.refine({ sessionId })).json()) as { left: number })
          .left,
      );
    expect(lefts).toEqual([1, 0]);
    const third = await t.refine({ sessionId });
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({
      error: { code: 'refine_limit_reached' },
    });
    expect(model.doGenerateCalls).toHaveLength(2);

    const fresh = await t.refine({ sessionId: randomUUID() });
    expect(await fresh.json()).toMatchObject({ left: 1 });
  });

  it('does not count provider errors or empty results; a retried requestId is served without a second charge', async () => {
    const model = mockModel(
      apiError(500, 'boom'),
      { dishes: [] },
      { dishes: [egg] },
    );
    const t = await setup(model);
    setLimit(t, 1);
    const sessionId = randomUUID();
    expect((await t.refine({ sessionId })).status).toBe(503);
    expect((await t.refine({ sessionId })).status).toBe(422);
    const requestId = randomUUID();
    expect(
      await (await t.refine({ sessionId, requestId })).json(),
    ).toMatchObject({ left: 0 });
    // The same request again: from memory, not refused, still left 0.
    const retry = await t.refine({ sessionId, requestId });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ left: 0 });
    expect((await t.refine({ sessionId })).status).toBe(429);
    expect(model.doGenerateCalls).toHaveLength(3);
  });

  it('counts a timeout once, even when the same requestId is retried after it', async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) => {
        calls++;
        if (calls > 1) return Promise.resolve(reply({ dishes: [egg] }));
        return new Promise((_, reject) =>
          abortSignal!.addEventListener('abort', () =>
            reject(abortSignal!.reason),
          ),
        );
      },
    });
    const t = await setup(model);
    setLimit(t, 2);
    const sessionId = randomUUID();
    const requestId = randomUUID();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = t.refine({ sessionId, requestId });
      await vi.waitFor(() => expect(calls).toBe(1));
      await vi.advanceTimersByTimeAsync(REFINE_TIMEOUT_MS);
      expect((await pending).status).toBe(503);
    } finally {
      vi.useRealTimers();
    }
    // The retry of the timed-out request calls again but is not charged a second time.
    expect(
      await (await t.refine({ sessionId, requestId })).json(),
    ).toMatchObject({ left: 1 });
  });

  it('is off by default, leaves recognize alone and is shown in /ai/status', async () => {
    const model = mockModel({ dishes: [egg] }, { dishes: [egg] });
    const t = await setup(model);
    expect(await t.status()).toMatchObject({ refineLimit: null });
    setLimit(t, 1);
    expect(await t.status()).toMatchObject({ refineLimit: 1 });
    expect((await t.recognize(await t.upload())).status).toBe(200);
    expect(await (await t.refine()).json()).toMatchObject({ left: 0 });
  });
});

it("sends the user's recipe names last logged first, never another user's (ADR-0035 §4)", async () => {
  const model = mockModel({ dishes: [{ ...egg, ref: 'd1' }] });
  const t = await setup(model);
  await t.signIn('b@example.com');
  const userId = (email: string) =>
    (
      t.db.prepare('SELECT id FROM users WHERE email = ?').get(email) as {
        id: number;
      }
    ).id;
  const add = (
    email: string,
    name: string,
    logged: number | null,
    updated: number,
  ) =>
    t.db
      .prepare(
        `INSERT INTO recipes (user_id, name, name_key, last_logged_at, rev, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, 0, ?)`,
      )
      .run(userId(email), name, name, logged, updated);
  add('admin@example.com', 'Never logged, new', null, 30);
  add('admin@example.com', 'Logged before', 10, 1);
  add('admin@example.com', 'Logged last', 20, 1);
  add('admin@example.com', 'Never logged, old', null, 5);
  add('b@example.com', 'Someone else', 99, 99);

  expect((await t.refine()).status).toBe(200);
  expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain(
    JSON.stringify(
      `<recipes>${JSON.stringify(['Logged last', 'Logged before', 'Never logged, new', 'Never logged, old'])}</recipes>`,
    ).slice(1, -1),
  );
});
