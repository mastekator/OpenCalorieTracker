import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, expect, it, vi } from 'vitest';
import { aiSetup, apiError, mockModel } from '../test/ai.js';
import { createModel } from './model.js';

vi.mock('./model.js', () => ({ createModel: vi.fn() }));

const egg = {
  name: 'Egg',
  grams: 50,
  kcal: 78,
  proteinG: 6.3,
  fatG: 5.3,
  carbsG: 0.6,
  confidence: 0.96,
};
const settingsB = {
  provider: 'openai' as const,
  model: 'model-b',
  apiKey: 'k',
  baseUrl: undefined,
  source: 'admin' as const,
};

afterEach(() => vi.restoreAllMocks());

it('apply(): new requests use the new model, the one in flight ends on the old, its late error is ignored (ADR-0018 §3)', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const a = new MockLanguageModelV4({
    modelId: 'model-a',
    doGenerate: async () => {
      await gate;
      throw apiError(401, 'bad key');
    },
  });
  const b = mockModel({ dishes: [egg] });
  const t = await aiSetup(a);

  const oldCall = t.recognize(await t.upload());
  await vi.waitFor(() => expect(a.doGenerateCalls).toHaveLength(1));

  vi.mocked(createModel).mockResolvedValueOnce(b);
  await t.ai.apply(settingsB);
  expect(t.ai.current()).toEqual({ settings: settingsB, model: b });

  // Another user: the first one still has a call running (one per user).
  const other = await t.signIn('b@example.com');
  const res = await t.recognize(await t.upload(other), other);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ dishes: [egg] });
  expect(b.doGenerateCalls).toHaveLength(1);

  release();
  // Served by the old model to the end: its 401 becomes ai_unavailable for this request only.
  expect((await oldCall).status).toBe(503);
  expect(a.doGenerateCalls).toHaveLength(1);
  const admin = await (
    await t.app.request('/api/admin/ai', { headers: { cookie: t.cookie } })
  ).json();
  expect(admin).toMatchObject({ model: 'model-b', state: 'ok' });
  await t.cleanup();
});

it('apply(): a model that cannot be created is manual mode with a [setup] line', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const t = await aiSetup(mockModel());
  vi.mocked(createModel).mockRejectedValueOnce(new TypeError('boom'));
  await t.ai.apply(settingsB);
  expect(t.ai.current()).toBeNull();
  expect(await t.status()).toMatchObject({ recognition: 'not_configured' });
  expect(error.mock.calls.map((c) => String(c[0]))).toContainEqual(
    expect.stringMatching(
      /^\[setup\] AI model could not be created \(TypeError\)/,
    ),
  );
  await t.cleanup();
});
