import { afterAll, expect, it, vi } from 'vitest';
import { aiSetup, apiError, mockModel } from '../test/ai.js';

// Own file: the no-vision flag is module state kept until restart, and vitest isolates modules per file.
const t = await aiSetup(
  mockModel(apiError(400, 'this model does not support image input')),
);
afterAll(() => t.cleanup());

it('learns no_vision from the first call and then refuses up front (AC-6.1)', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const id = await t.upload();
  for (let i = 0; i < 2; i++) {
    const res = await t.recognize(id);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: 'ai_no_vision', details: { aiSource: 'server' } },
    });
  }
  expect(await t.status()).toMatchObject({ recognition: 'no_vision' });
  const ingredients = await t.app.request(
    `/api/photos/${id}/recognize?mode=ingredients`,
    {
      method: 'POST',
      headers: { cookie: t.cookie, origin: 'http://localhost:3000' },
    },
  );
  expect(ingredients.status).toBe(409);
  expect(await ingredients.json()).toEqual({
    error: { code: 'ai_no_vision', details: { aiSource: 'server' } },
  });
});
