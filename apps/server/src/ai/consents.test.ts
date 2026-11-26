import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiConsentsResponse } from '@oct/shared';
import { aiSetup, mockModel } from '../test/ai.js';

const CLOUD = {
  AI_PROVIDER: 'openai-compatible',
  AI_MODEL: 'vision-1',
  AI_BASE_URL: 'https://llm.example.com/v1',
};
const KEY = 'openai-compatible:llm.example.com';

let cleanup: (() => Promise<void>) | undefined;
async function setup(env: Record<string, string> = CLOUD) {
  // Each call answers garbage: enough to see the provider was called.
  const model = mockModel(...Array.from({ length: 10 }, () => ({ nope: 1 })));
  const t = await aiSetup(model, env);
  cleanup = t.cleanup;
  t.db.exec('DELETE FROM ai_consents');
  const call = (method: string, path: string, body?: unknown, as = t.cookie) =>
    t.app.request(`/api${path}`, {
      method,
      headers: {
        cookie: as,
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const consents = async (as = t.cookie) =>
    (await (
      await call('GET', '/ai/consents', undefined, as)
    ).json()) as AiConsentsResponse;
  return { ...t, model, call, consents };
}
type T = Awaited<ReturnType<typeof setup>>;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup?.();
  cleanup = undefined;
});

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
  ],
  steps: [],
  per100: null,
  servingG: null,
};
const dish = {
  id: 'd1',
  name: 'Egg',
  grams: 50,
  kcal: 78,
  proteinG: 6.3,
  fatG: 5.3,
  carbsG: 0.6,
  fixed: [],
};

// Every route that sends a user's data to the model (ADR-0031 §3, AC-C.9).
const routes: [string, (t: T) => Promise<() => Promise<Response>>][] = [
  [
    'recognize a meal',
    async (t) => {
      const id = await t.upload();
      return () => t.call('POST', `/photos/${id}/recognize`);
    },
  ],
  [
    'read a label',
    async (t) => {
      const id = await t.upload();
      return () =>
        t.call(
          'POST',
          `/photos/${id}/recognize?mode=label&barcode=4006381333931`,
        );
    },
  ],
  [
    'recognize ingredients',
    async (t) => {
      const id = await t.upload();
      return () => t.call('POST', `/photos/${id}/recognize?mode=ingredients`);
    },
  ],
  [
    'refine',
    async (t) => () =>
      t.call('POST', '/ai/refine', {
        mode: 'refine',
        requestId: randomUUID(),
        sessionId: randomUUID(),
        text: 'it was 100 g',
        dishes: [dish],
      }),
  ],
  [
    'make a recipe lighter',
    async (t) => {
      const res = await t.call('POST', '/recipes', recipe);
      const { id } = (await res.json()) as { id: number };
      return () => t.call('POST', `/ai/recipes/${id}/lighter`);
    },
  ],
  [
    'parse a recipe',
    async (t) => () =>
      t.call('POST', '/ai/recipes/parse', { text: 'Pasta 200 g' }),
  ],
  [
    'talk to the norm agent',
    async (t) => {
      await t.call('GET', '/norm-agent');
      return () => t.call('POST', '/norm-agent/messages', { text: 'Hi' });
    },
  ],
];

describe.each(routes)('%s', (_, prepare) => {
  it('is 403 ai_consent_required without consent and never calls the provider', async () => {
    const t = await setup();
    const send = await prepare(t);
    const res = await send();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: {
        code: 'ai_consent_required',
        details: {
          providerKey: KEY,
          provider: 'openai-compatible',
          host: 'llm.example.com',
          aiSource: 'server',
        },
      },
    });
    expect(t.model.doGenerateCalls).toHaveLength(0);
  });

  it('calls the provider after consent', async () => {
    const t = await setup();
    const send = await prepare(t);
    const granted = await t.call('POST', '/ai/consents', { providerKey: KEY });
    expect(granted.status).toBe(204);
    expect((await send()).status).not.toBe(403);
    expect(t.model.doGenerateCalls.length).toBeGreaterThan(0);
  });
});

it('asks no consent for a model in the local network (AC-C.6)', async () => {
  const t = await setup({ ...CLOUD, AI_BASE_URL: 'http://ollama:11434/v1' });
  const res = await t.call('POST', `/photos/${await t.upload()}/recognize`);
  expect(res.status).not.toBe(403);
  expect(t.model.doGenerateCalls.length).toBeGreaterThan(0);
  expect((await t.consents()).server).toEqual({
    providerKey: 'openai-compatible:ollama:11434',
    provider: 'openai-compatible',
    host: 'ollama:11434',
    local: true,
  });
});

describe('/api/ai/consents', () => {
  it('lists own consents only, revokes them and needs a session', async () => {
    const t = await setup();
    expect(await t.consents()).toEqual({
      consents: [],
      server: {
        providerKey: KEY,
        provider: 'openai-compatible',
        host: 'llm.example.com',
        local: false,
      },
    });
    await t.call('POST', '/ai/consents', { providerKey: KEY });
    // Idempotent: the first grant time stays.
    await t.call('POST', '/ai/consents', { providerKey: KEY });
    const { consents } = await t.consents();
    expect(consents).toEqual([
      { providerKey: KEY, grantedAt: expect.any(Number) },
    ]);
    const other = await t.signIn('b@example.com');
    expect((await t.consents(other)).consents).toEqual([]);

    const revoked = await t.call(
      'DELETE',
      `/ai/consents/${encodeURIComponent(KEY)}`,
    );
    expect(revoked.status).toBe(204);
    expect((await t.consents()).consents).toEqual([]);
    const id = await t.upload();
    expect((await t.call('POST', `/photos/${id}/recognize`)).status).toBe(403);

    expect((await t.call('GET', '/ai/consents', undefined, '')).status).toBe(
      401,
    );
  });

  it('validates the key length', async () => {
    const t = await setup();
    for (const providerKey of ['', 'x'.repeat(201)])
      expect(
        (await t.call('POST', '/ai/consents', { providerKey })).status,
      ).toBe(400);
  });
});
