import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LighterResponse } from '@oct/shared';
import { aiSetup, mockModel, reply } from '../test/ai.js';

const recipe = {
  name: 'Pasta',
  cookedG: null,
  servings: 2,
  note: null,
  photoId: null,
  ingredients: [
    {
      name: 'Pasta',
      grams: 200,
      kcal: 700,
      proteinG: 24,
      fatG: 3,
      carbsG: 140,
      source: 'manual',
    },
    {
      name: 'Oil',
      grams: 20,
      kcal: 180,
      proteinG: 0,
      fatG: 20,
      carbsG: 0,
      source: 'manual',
    },
  ],
  steps: [],
  per100: null,
  servingG: null,
};

const lighter = {
  variants: [
    {
      ingredients: [
        // The model lies in kcal: the code must ignore it.
        {
          change: 'same',
          from: 0,
          name: 'Pasta',
          grams: 200,
          per100: { kcal: 1, proteinG: 0, fatG: 0, carbsG: 0 },
          why: '',
        },
        {
          change: 'reduced',
          from: 1,
          name: 'Oil',
          grams: 5,
          per100: null,
          why: 'Less oil',
        },
      ],
    },
  ],
};

let cleanup: (() => Promise<void>) | undefined;
async function setup(model: Parameters<typeof aiSetup>[0]) {
  const t = await aiSetup(model);
  cleanup = t.cleanup;
  const create = async (as = t.cookie, body: object = recipe) => {
    const res = await t.app.request('/api/recipes', {
      method: 'POST',
      headers: {
        cookie: as,
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return ((await res.json()) as { id: number }).id;
  };
  const ask = (id: number | string, as = t.cookie) =>
    t.app.request(`/api/ai/recipes/${id}/lighter`, {
      method: 'POST',
      headers: { cookie: as, origin: 'http://localhost:3000' },
    });
  return { ...t, create, ask };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup?.();
  cleanup = undefined;
});

it('answers variants recalculated by code, without the recipe in the log', async () => {
  const model = mockModel(lighter);
  const t = await setup(model);
  const res = await t.ask(await t.create());
  expect(res.status).toBe(200);
  const body = (await res.json()) as LighterResponse;
  expect(body.variants).toHaveLength(1);
  expect(
    body.variants[0]!.ingredients.map((i) => [i.name, i.grams, i.kcal]),
  ).toEqual([
    ['Pasta', 200, 700],
    ['Oil', 5, 45],
  ]);
  expect(body.variants[0]!.changes).toEqual([
    { change: 'reduced', from: 1, name: 'Oil', grams: 5, why: 'Less oil' },
  ]);
  const prompt = JSON.stringify(model.doGenerateCalls[0]!.prompt);
  expect(prompt).toContain('\\"name\\":\\"Oil\\"');
  const logs = vi.mocked(console.log).mock.calls.flat().join('\n');
  expect(logs).toMatch(/ai\.lighter .* variants=1 result=ok/);
  expect(logs).not.toContain('Oil');
});

it('retries once on garbage, then answers ai_invalid_response', async () => {
  const garbage = {
    variants: [
      {
        ingredients: [
          {
            change: 'removed',
            from: 9,
            name: '',
            grams: 0,
            per100: null,
            why: '',
          },
        ],
      },
    ],
  };
  const model = mockModel({ nope: 1 }, lighter, garbage, garbage);
  const t = await setup(model);
  expect((await t.ask(await t.create())).status).toBe(200);

  const res = await t.ask(await t.create());
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({
    error: { code: 'ai_invalid_response', details: { aiSource: 'server' } },
  });
  expect(model.doGenerateCalls).toHaveLength(4);
});

it("is 404 for another user's or a missing recipe", async () => {
  const t = await setup(mockModel(lighter));
  const other = await t.create(await t.signIn('b@example.com'));
  expect((await t.ask(other)).status).toBe(404);
  expect((await t.ask(999)).status).toBe(404);
  expect((await t.ask('abc')).status).toBe(404);
});

it('is 400 for a recipe without ingredients, without calling the model', async () => {
  const model = mockModel(lighter);
  const t = await setup(model);
  const id = await t.create(t.cookie, {
    ...recipe,
    servings: null,
    ingredients: [],
    per100: { kcal: 321, proteinG: 6, fatG: 22, carbsG: 25 },
  });
  const res = await t.ask(id);
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({
    error: { code: 'validation_failed' },
  });
  expect(model.doGenerateCalls).toHaveLength(0);
});

it('is 409 ai_not_configured without AI', async () => {
  const off = await setup(null);
  const res = await off.ask(await off.create());
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: { code: 'ai_not_configured' } });
});

it('allows one AI call per user at a time: 429, the same recipe joins', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      await gate;
      return reply(lighter);
    },
  });
  const t = await setup(model);
  const [a, b] = [await t.create(), await t.create()];
  const first = t.ask(a);
  await vi.waitFor(() => expect(model.doGenerateCalls).toHaveLength(1));
  const busy = await t.ask(b);
  expect(busy.status).toBe(429);
  expect(await busy.json()).toEqual({
    error: { code: 'too_many_attempts', details: { retryAfterSec: 5 } },
  });
  const joined = t.ask(a);
  release();
  expect((await first).status).toBe(200);
  expect((await joined).status).toBe(200);
  expect(model.doGenerateCalls).toHaveLength(1);
});
