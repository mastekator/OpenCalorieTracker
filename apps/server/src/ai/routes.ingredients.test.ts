import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { photoPath } from '../photos/store.js';
import { aiSetup, apiError, mockModel } from '../test/ai.js';

const row = {
  name: 'Carrot',
  readValue: 0.5,
  readUnit: 'kg',
  weightFrom: 'scale',
  estimateG: 400,
  pieces: null,
  unit: null,
  kcal100: 41,
  protein100: 0.9,
  fat100: 0.2,
  carbs100: 9.6,
  confidence: 0.9,
  barcode: null,
  printedBarcode: null,
  edibleRef: null,
  ediblePct: null,
};
const CODE = '4006381333931';
const PRINTED = '8997035601383';

let cleanup: (() => Promise<void>) | undefined;
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup?.();
  cleanup = undefined;
});

const setup = async (...args: Parameters<typeof aiSetup>) => {
  const t = await aiSetup(...args);
  cleanup = t.cleanup;
  const ingredients = (id: string) =>
    t.app.request(`/api/photos/${id}/recognize?mode=ingredients`, {
      method: 'POST',
      headers: { cookie: t.cookie, origin: 'http://localhost:3000' },
    });
  const userId = (
    t.db
      .prepare("SELECT id FROM users WHERE email = 'admin@example.com'")
      .get() as { id: number }
  ).id;
  const stored = (id: string) =>
    Promise.all(
      (['full', 'preview'] as const).map((s) =>
        access(photoPath(t.dataDir, userId, id, s)!).then(
          () => true,
          () => false,
        ),
      ),
    );
  return { ...t, ingredients, userId, stored };
};

it('reads raw products, picks the weight in code and deletes the photo (AC-B4, AC-B9)', async () => {
  const model = mockModel({ items: [row] });
  const t = await setup(model);
  const id = await t.upload();
  const res = await t.ingredients(id);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    items: [
      {
        name: 'Carrot',
        grams: 500,
        kcal: 205,
        proteinG: 4.5,
        fatG: 1,
        carbsG: 48,
        per100: { kcal: 41, proteinG: 0.9, fatG: 0.2, carbsG: 9.6 },
        weight: 'scale',
        source: 'ai',
      },
    ],
  });
  expect(await t.stored(id)).toEqual([false, false]);
  // A retry gets the cached answer though the photo is gone.
  expect((await t.ingredients(id)).status).toBe(200);
  expect(model.doGenerateCalls).toHaveLength(1);
  expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain(
    'raw products',
  );
});

it('returns an empty list when there are no products', async () => {
  const t = await setup(mockModel({ items: [] }));
  const id = await t.upload();
  expect(await (await t.ingredients(id)).json()).toEqual({ items: [] });
});

it('deletes the photo after a model error too', async () => {
  const t = await setup(mockModel(apiError(500), apiError(500)));
  const id = await t.upload();
  const res = await t.ingredients(id);
  expect(res.status).toBeGreaterThanOrEqual(500);
  expect(await t.stored(id)).toEqual([false, false]);
});

it('never deletes a photo a meal owns', async () => {
  const t = await setup(mockModel({ items: [row] }));
  const id = await t.upload();
  t.db
    .prepare(
      `INSERT INTO meals (user_id, client_id, eaten_at, tz_offset_min, local_date, meal_type, photo_id, created_at, updated_at)
       VALUES (?, 'm', 0, 0, '2024-04-03', 'lunch', ?, 0, 0)`,
    )
    .run(t.userId, id);
  expect((await t.ingredients(id)).status).toBe(200);
  expect(await t.stored(id)).toEqual([true, true]);
});

it('is 409 ai_not_configured without AI', async () => {
  const t = await setup(null);
  const res = await t.ingredients('A'.repeat(22));
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: { code: 'ai_not_configured' } });
});

it('passes whole pieces of an estimated product; an answer without the field is as before', async () => {
  const old: Partial<typeof row> = { ...row };
  delete old.pieces;
  const estimated = { weightFrom: null, readValue: null, readUnit: null };
  const t = await setup(
    mockModel({
      items: [
        { ...row, ...estimated, name: 'Egg', estimateG: 165, pieces: 3 },
        { ...old, ...estimated, name: 'Onion' },
      ],
    }),
  );
  const id = await t.upload();
  const body = (await (await t.ingredients(id)).json()) as {
    items: Record<string, unknown>[];
  };
  expect(body.items[0]).toMatchObject({
    grams: 165,
    weight: 'estimate',
    pieces: 3,
  });
  expect(body.items[1]).toMatchObject({ grams: 400, weight: 'estimate' });
  expect(body.items[1]).not.toHaveProperty('pieces');
});

it('picks the edible share without asking (AC-B7)', async () => {
  const t = await setup(
    mockModel({
      items: [
        { ...row, name: 'Sapodilla', edibleRef: 'sapodilla' },
        { ...row, name: 'Odd fruit', ediblePct: 60, confidence: 0.3 },
      ],
    }),
  );
  const id = await t.upload();
  const body = (await (await t.ingredients(id)).json()) as {
    items: { grams: number; kcal: number; edible?: unknown }[];
  };
  expect(body.items[0]).toMatchObject({
    grams: 400,
    kcal: 164,
    edible: { grossG: 500, pct: 80, source: 'ref', key: 'sapodilla' },
  });
  // A low-confidence model share is not used and nothing is asked.
  expect(body.items[1]).toMatchObject({ grams: 500 });
  expect(body.items[1]).not.toHaveProperty('edible');
  expect(body).not.toHaveProperty('questions');
});

it('takes nutrients from the product by barcode; one lookup per code; a failed lookup is the estimate', async () => {
  const off = vi.fn(async () => new Response('', { status: 500 }));
  const t = await setup(
    mockModel({
      items: [
        { ...row, weightFrom: null, barcode: CODE },
        { ...row, weightFrom: null, printedBarcode: PRINTED },
        { ...row, weightFrom: null, printedBarcode: PRINTED },
      ],
    }),
    {},
    off as unknown as typeof fetch,
  );
  t.db.prepare('UPDATE users SET off_enabled = 1').run();
  t.db
    .prepare(
      `INSERT INTO user_products (user_id, code, name, kcal_100, per, created_at, updated_at)
       VALUES (?, ?, 'Flour', 350, 'g', 0, 0)`,
    )
    .run(t.userId, CODE);
  t.db
    .prepare(
      'INSERT INTO product_prefs (user_id, code, pack_g, updated_at) VALUES (?, ?, 1000, 0)',
    )
    .run(t.userId, CODE);
  const photo = await readFile(
    join(import.meta.dirname, '../barcodes/fixtures/ean13.jpg'),
  );
  const up = await t.app.request('/api/photos', {
    method: 'POST',
    headers: { 'content-type': 'image/jpeg', cookie: t.cookie },
    body: new Uint8Array(photo),
  });
  const { photoId } = (await up.json()) as { photoId: string };
  const { items } = (await (await t.ingredients(photoId)).json()) as {
    items: Record<string, unknown>[];
  };
  expect(items[0]).toMatchObject({
    name: 'Flour',
    grams: 1000,
    kcal: 3500,
    weight: 'barcode',
    source: 'barcode',
    barcode: CODE,
  });
  expect(items[1]).toMatchObject({
    grams: 400,
    weight: 'estimate',
    source: 'ai',
  });
  expect(off).toHaveBeenCalledTimes(1);
});
