import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { Meal, MealInput, PreviousDishesResponse } from '@oct/shared';
import type { AiModel } from '../ai/model.js';
import { ensureAdmin } from '../auth/admin.js';
import { hashPassword } from '../auth/password.js';
import { photoPath } from '../photos/store.js';
import { mockModel } from '../test/ai.js';
import { setCookie, testApp } from '../test/app.js';
import { checkWhen } from './routes.js';

const PASSWORD = 'Correct-horse-battery-9';
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true })));
});

async function setup(
  env: Record<string, string> = {},
  model: AiModel | null = null,
) {
  const dataDir = await mkdtemp(join(tmpdir(), 'oct-meals-'));
  dirs.push(dataDir);
  const t = testApp({ DATA_DIR: dataDir, ...env }, model);
  await ensureAdmin(t.config, t.db);
  const signIn = async (email: string) => {
    const res = await t.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    return setCookie(res, 'oct_session')!.split(';')[0]!;
  };
  const call = (cookie: string, method: string, path: string, body?: unknown) =>
    t.app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const upload = async (cookie: string) => {
    const img = await sharp({
      create: { width: 64, height: 48, channels: 3, background: '#a52' },
    })
      .jpeg()
      .toBuffer();
    const res = await t.app.request('/api/photos', {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', cookie },
      body: new Uint8Array(img),
    });
    return ((await res.json()) as { photoId: string }).photoId;
  };
  const addUser = async (email: string) => {
    const id = t.db
      .prepare(
        "INSERT INTO users (email, role, webauthn_user_id, created_at) VALUES (?, 'user', randomblob(16), 0) RETURNING id",
      )
      .pluck()
      .get(email) as number;
    t.db
      .prepare(
        'INSERT INTO passwords (user_id, hash, updated_at) VALUES (?, ?, 0)',
      )
      .run(id, await hashPassword(PASSWORD));
    return signIn(email);
  };
  const adminId = t.db
    .prepare("SELECT id FROM users WHERE email = 'admin@example.com'")
    .pluck()
    .get() as number;
  return {
    ...t,
    dataDir,
    call,
    upload,
    addUser,
    adminId,
    cookie: await signIn('admin@example.com'),
  };
}

const input = (patch: Partial<MealInput> = {}): MealInput => ({
  clientId: randomUUID(),
  eatenAt: '2026-01-10T12:00:00.000Z',
  tzOffsetMin: 180,
  localDate: '2026-01-10',
  mealType: 'lunch',
  items: [
    {
      name: 'Гречка  с курицей',
      grams: 283.5,
      kcal: 412.3,
      proteinG: 30.1,
      fatG: 9.9,
      carbsG: 50.05,
      source: 'ai',
      confidence: 0.82,
    },
    {
      name: 'Tea',
      grams: 200,
      kcal: 2,
      proteinG: 0,
      fatG: 0,
      carbsG: 0.4,
      source: 'manual',
    },
  ],
  ...patch,
});

describe('meals', () => {
  it('creates once per clientId, even for concurrent requests (E-4.1)', async () => {
    const t = await setup();
    const body = input();
    const first = await t.call(t.cookie, 'POST', '/meals', body);
    expect(first.status).toBe(201);
    const meal = (await first.json()) as Meal;
    const again = await t.call(t.cookie, 'POST', '/meals', {
      ...body,
      mealType: 'dinner',
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(meal);

    const race = input();
    const both = await Promise.all([
      t.call(t.cookie, 'POST', '/meals', race),
      t.call(t.cookie, 'POST', '/meals', race),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(t.db.prepare('SELECT COUNT(*) FROM meals').pluck().get()).toBe(2);
  });

  it('stores the values as sent and sums them on the server (AC-4.2)', async () => {
    const t = await setup();
    const body = input();
    const meal = (await (
      await t.call(t.cookie, 'POST', '/meals', body)
    ).json()) as Meal;
    expect(meal).toMatchObject({
      clientId: body.clientId,
      eatenAt: body.eatenAt,
      tzOffsetMin: 180,
      localDate: '2026-01-10',
      mealType: 'lunch',
      photo: null,
      recalcOffer: false,
      kcal: 414.3,
      carbsG: 50.449999999999996,
    });
    expect(meal.items[0]).toMatchObject({
      name: 'Гречка  с курицей',
      grams: 283.5,
      kcal: 412.3,
      illustration: 'grains',
      illustrationManual: false,
    });
    expect(
      t.db
        .prepare('SELECT name_key FROM meal_items ORDER BY position')
        .pluck()
        .all(),
    ).toEqual(['гречка с курицей', 'tea']);
    expect((await t.call(t.cookie, 'GET', `/meals/${meal.id}`)).status).toBe(
      200,
    );
  });

  it('records the AI provider and model from the server settings (AC-4.1)', async () => {
    const withAi = await setup(
      { AI_PROVIDER: 'google', AI_MODEL: 'gemini-x' },
      mockModel(),
    );
    const meal = (await (
      await withAi.call(withAi.cookie, 'POST', '/meals', input())
    ).json()) as Meal;
    expect(
      meal.items.map((i) => [i.source, i.aiProvider, i.aiModel, i.confidence]),
    ).toEqual([
      ['ai', 'google', 'gemini-x', 0.82],
      ['manual', null, null, null],
    ]);

    // An edit after the server switched models keeps the model that recognized the photo.
    withAi.db
      .prepare(
        "UPDATE meal_items SET ai_provider = 'openai', ai_model = 'gpt-old'",
      )
      .run();
    const edited = (await (
      await withAi.call(withAi.cookie, 'PATCH', `/meals/${meal.id}`, {
        items: input().items,
      })
    ).json()) as Meal;
    expect(edited.items[0]).toMatchObject({
      aiProvider: 'openai',
      aiModel: 'gpt-old',
    });

    // A recalculation from the photo is the current model's (AC-10.10).
    const recalced = (await (
      await withAi.call(withAi.cookie, 'PATCH', `/meals/${meal.id}`, {
        items: input().items,
        recalcOffer: false,
      })
    ).json()) as Meal;
    expect(recalced.items[0]).toMatchObject({
      source: 'ai',
      aiProvider: 'google',
      aiModel: 'gemini-x',
    });

    const manual = await setup();
    const m2 = (await (
      await manual.call(manual.cookie, 'POST', '/meals', input())
    ).json()) as Meal;
    expect(m2.items[0]).toMatchObject({
      source: 'ai',
      aiProvider: null,
      aiModel: null,
    });
  });

  it('stores the dish unit: g by default, ml when sent (ADR-0038 §2)', async () => {
    const t = await setup();
    const [food, drink] = input().items;
    const res = await t.call(
      t.cookie,
      'POST',
      '/meals',
      input({ items: [food!, { ...drink!, unit: 'ml' }] }),
    );
    expect(res.status).toBe(201);
    const meal = (await res.json()) as Meal;
    expect(meal.items.map((i) => i.unit)).toEqual(['g', 'ml']);

    const sync = (await (
      await t.call(t.cookie, 'GET', '/sync?since=0')
    ).json()) as { meals: Meal[] };
    expect(sync.meals[0]!.items.map((i) => i.unit)).toEqual(['g', 'ml']);

    // Within the 90-day history window.
    t.db.prepare('UPDATE meals SET eaten_at = ?').run(Date.now() - 60_000);
    const prev = (await (
      await t.call(t.cookie, 'POST', '/dishes/previous', {
        dishes: [{ name: 'Tea' }],
      })
    ).json()) as PreviousDishesResponse;
    expect(prev[0]).toMatchObject({ grams: 200, unit: 'ml' });

    // Editing without a unit falls back to g, as an older client sends.
    const edited = (await (
      await t.call(t.cookie, 'PATCH', `/meals/${meal.id}`, {
        items: [drink],
      })
    ).json()) as Meal;
    expect(edited.items[0]!.unit).toBe('g');
  });

  it('rejects bad input with 400', async () => {
    const t = await setup();
    const item = input().items[1]!;
    for (const body of [
      input({ items: [] }),
      input({ items: [{ ...item, grams: 0 }] }),
      input({ items: [{ ...item, grams: 5000.1 }] }),
      input({ items: [{ ...item, barcode: '4006381333932' }] }), // bad check digit
      input({ items: [{ ...item, unit: 'oz' as 'g' }] }),
      input({ localDate: '2026-01-09' }), // 15:00 local: "yesterday" is not allowed
      input({ localDate: '2026-01-11' }),
      input({ eatenAt: new Date(Date.now() + 10 * 60_000).toISOString() }),
    ])
      expect((await t.call(t.cookie, 'POST', '/meals', body)).status).toBe(400);
    expect(t.db.prepare('SELECT COUNT(*) FROM meals').pluck().get()).toBe(0);
  });

  it('keeps the barcode and remembers typed-in products (ADR-0034 §6)', async () => {
    const t = await setup();
    const dish = (patch: Partial<MealInput['items'][number]>) => ({
      ...input().items[1]!,
      ...patch,
    });
    const mine = async (code: string) =>
      (await (await t.call(t.cookie, 'GET', `/barcodes/${code}`)).json()) as {
        from: string | null;
        product: Record<string, unknown> | null;
      };
    const res = await t.call(
      t.cookie,
      'POST',
      '/meals',
      input({
        items: [
          // UPC-A is stored as GTIN-13.
          dish({
            name: 'Yogurt',
            grams: 150,
            kcal: 90,
            proteinG: 4.5,
            source: 'label',
            barcode: '036000291452',
          }),
          dish({
            name: 'Bar',
            grams: 40,
            kcal: 200,
            source: 'barcode',
            barcode: '4006381333931',
          }),
          dish({ name: 'Water', grams: 500, kcal: 0, barcode: '96385074' }),
        ],
      }),
    );
    expect(res.status).toBe(201);
    const meal = (await res.json()) as Meal;
    expect(meal.items.map((i) => [i.source, i.barcode])).toEqual([
      ['label', '0036000291452'],
      ['barcode', '4006381333931'],
      ['manual', '96385074'],
    ]);
    expect(await mine('036000291452')).toMatchObject({
      from: 'mine',
      product: { name: 'Yogurt', kcal100: 60, protein100: 3, per: 'g' },
    });
    // A found product and zero kcal are not remembered.
    expect(
      t.db.prepare('SELECT COUNT(*) FROM user_products').pluck().get(),
    ).toBe(1);

    // Editing the dish updates the product.
    await t.call(t.cookie, 'PATCH', `/meals/${meal.id}`, {
      items: [
        dish({
          name: 'Greek yogurt',
          grams: 200,
          kcal: 240,
          barcode: '0036000291452',
        }),
      ],
    });
    expect((await mine('0036000291452')).product).toMatchObject({
      name: 'Greek yogurt',
      kcal100: 120,
      per: 'g',
    });

    // A drink with the same barcode switches the product to ml (ADR-0038 §2).
    await t.call(t.cookie, 'PATCH', `/meals/${meal.id}`, {
      items: [
        dish({
          name: 'Kefir',
          grams: 500,
          unit: 'ml',
          kcal: 250,
          barcode: '0036000291452',
        }),
      ],
    });
    expect((await mine('0036000291452')).product).toMatchObject({
      name: 'Kefir',
      kcal100: 50,
      per: 'ml',
    });
    expect(
      t.db.prepare('SELECT COUNT(*) FROM user_products').pluck().get(),
    ).toBe(1);
  });

  it('remembers the package weight, pieces and last amount per user (ADR-0037 §2, §3)', async () => {
    const t = await setup();
    const other = await t.addUser('b@example.com');
    const OFF = '4006381333931';
    const OWN = '0036000291452';
    // A fresh Open Food Facts answer with its own package weight.
    t.db
      .prepare(
        `INSERT INTO food_products (code, status, names, kcal_100, per, pack_g, fetched_at)
         VALUES (?, 'found', '{"default":"Choco bar"}', 530, 'g', 100, ?)`,
      )
      .run(OFF, Date.now());
    const dish = (patch: Partial<MealInput['items'][number]>) => ({
      ...input().items[1]!,
      ...patch,
    });
    const product = async (code: string, cookie = t.cookie) =>
      (
        (await (await t.call(cookie, 'GET', `/barcodes/${code}`)).json()) as {
          product: Record<string, unknown> | null;
        }
      ).product;
    const mine = async (cookie = t.cookie) =>
      (
        (await (await t.call(cookie, 'GET', '/products/mine')).json()) as {
          products: Record<string, unknown>[];
        }
      ).products;

    const res = await t.call(
      t.cookie,
      'POST',
      '/meals',
      input({
        items: [
          dish({
            source: 'barcode',
            barcode: OFF,
            pack: {
              packG: 120,
              pieces: 4,
              amount: { mode: 'pack', value: 0.5 },
            },
          }),
          dish({
            name: 'Yogurt',
            kcal: 90,
            source: 'label',
            barcode: OWN,
            pack: { pieces: 2 },
          }),
        ],
      }),
    );
    expect(res.status).toBe(201);
    const meal = (await res.json()) as Meal;
    // The user's weight beats the one from OFF.
    expect(await product(OFF)).toMatchObject({
      packG: 120,
      pieces: 4,
      last: { mode: 'pack', value: 0.5 },
    });
    expect(await product(OWN)).toMatchObject({
      name: 'Yogurt',
      packG: null,
      pieces: 2,
      last: null,
    });
    // Own products first, then cached OFF products with prefs, which have no savedAt.
    const list = await mine();
    expect(list.map((p) => [p.code, p.pieces, 'savedAt' in p])).toEqual([
      [OWN, 2, true],
      [OFF, 4, false],
    ]);

    // An edit that sends only the amount keeps the weight and pieces.
    await t.call(t.cookie, 'PATCH', `/meals/${meal.id}`, {
      items: [
        dish({
          source: 'barcode',
          barcode: OFF,
          pack: { amount: { mode: 'piece', value: 1 } },
        }),
      ],
    });
    expect(await product(OFF)).toMatchObject({
      packG: 120,
      pieces: 4,
      last: { mode: 'piece', value: 1 },
    });

    // Another user sees OFF's product without these prefs (AC-2.5).
    expect(await product(OFF, other)).toMatchObject({
      packG: 100,
      pieces: null,
      last: null,
    });
    expect(await mine(other)).toEqual([]);
  });

  it('rejects a bad pack with 400', async () => {
    const t = await setup();
    const item = { ...input().items[1]!, barcode: '4006381333931' };
    for (const pack of [
      { packG: 0.5 },
      { packG: 5001 },
      { pieces: 1.5 },
      { pieces: 1001 },
      { amount: { mode: 'pack', value: 10.5 } },
      { amount: { mode: 'piece', value: 1.5 } },
      { amount: { mode: 'weight', value: 0 } },
    ])
      expect(
        (
          await t.call(
            t.cookie,
            'POST',
            '/meals',
            input({ items: [{ ...item, pack }] }),
          )
        ).status,
      ).toBe(400);
    const noCode = { ...item, barcode: undefined };
    expect(
      (
        await t.call(
          t.cookie,
          'POST',
          '/meals',
          input({ items: [{ ...noCode, pack: { pieces: 2 } }] }),
        )
      ).status,
    ).toBe(400);
    expect(
      t.db.prepare('SELECT COUNT(*) FROM product_prefs').pluck().get(),
    ).toBe(0);
  });

  it("hides another user's meal: 404 on GET/PATCH, 204 on DELETE without deleting (AC-4.4)", async () => {
    const t = await setup();
    const other = await t.addUser('b@example.com');
    const meal = (await (
      await t.call(t.cookie, 'POST', '/meals', input())
    ).json()) as Meal;
    expect((await t.call(other, 'GET', `/meals/${meal.id}`)).status).toBe(404);
    expect(
      (await t.call(other, 'PATCH', `/meals/${meal.id}`, { mealType: 'snack' }))
        .status,
    ).toBe(404);
    expect((await t.call(other, 'DELETE', `/meals/${meal.id}`)).status).toBe(
      204,
    );
    expect((await t.call(t.cookie, 'GET', `/meals/${meal.id}`)).status).toBe(
      200,
    );
    expect((await t.call(t.cookie, 'GET', '/meals/abc')).status).toBe(404);
  });

  it('edits type, time, offer and replaces dishes', async () => {
    const t = await setup();
    const meal = (await (
      await t.call(t.cookie, 'POST', '/meals', input({ recalcOffer: true }))
    ).json()) as Meal;
    const res = await t.call(t.cookie, 'PATCH', `/meals/${meal.id}`, {
      mealType: 'snack',
      recalcOffer: false,
      // 01:30 local on Jan 11 may go to "yesterday" (AC-0.1a).
      eatenAt: '2026-01-10T22:30:00.000Z',
      tzOffsetMin: 180,
      localDate: '2026-01-10',
      items: [{ ...input().items[1]!, name: 'Coffee', kcal: 5 }],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: meal.id,
      mealType: 'snack',
      recalcOffer: false,
      eatenAt: '2026-01-10T22:30:00.000Z',
      localDate: '2026-01-10',
      kcal: 5,
      items: [{ name: 'Coffee' }],
    });
    expect(t.db.prepare('SELECT COUNT(*) FROM meal_items').pluck().get()).toBe(
      1,
    );
    expect(
      (
        await t.call(t.cookie, 'PATCH', `/meals/${meal.id}`, {
          eatenAt: '2026-01-10T12:00:00.000Z',
        })
      ).status,
    ).toBe(400);
  });

  it('attaches a photo, refuses a taken or foreign one, and keeps retries idempotent', async () => {
    const t = await setup();
    const photoId = await t.upload(t.cookie);
    const body = input({ photoId });
    const res = await t.call(t.cookie, 'POST', '/meals', body);
    expect(res.status).toBe(201);
    expect(((await res.json()) as Meal).photo).toEqual({
      id: photoId,
      full: true,
    });
    const row = t.db
      .prepare('SELECT eaten_at, photo_expires_at FROM meals')
      .get() as { eaten_at: number; photo_expires_at: number };
    expect(row.photo_expires_at - row.eaten_at).toBe(30 * 86_400_000);

    expect((await t.call(t.cookie, 'POST', '/meals', body)).status).toBe(200);
    const taken = await t.call(t.cookie, 'POST', '/meals', input({ photoId }));
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: { code: 'photo_in_use' } });
    const other = await t.addUser('b@example.com');
    expect(
      (await t.call(other, 'POST', '/meals', input({ photoId }))).status,
    ).toBe(404);
    expect(
      (
        await t.call(
          t.cookie,
          'POST',
          '/meals',
          input({ photoId: 'A'.repeat(22) }),
        )
      ).status,
    ).toBe(404);
  });

  it('moves the photo expiry with the meal time', async () => {
    const t = await setup();
    const meal = (await (
      await t.call(
        t.cookie,
        'POST',
        '/meals',
        input({ photoId: await t.upload(t.cookie) }),
      )
    ).json()) as Meal;
    await t.call(t.cookie, 'PATCH', `/meals/${meal.id}`, {
      eatenAt: '2026-01-09T12:00:00.000Z',
      tzOffsetMin: 180,
      localDate: '2026-01-09',
    });
    expect(
      t.db.prepare('SELECT photo_expires_at FROM meals').pluck().get(),
    ).toBe(Date.parse('2026-01-09T12:00:00.000Z') + 30 * 86_400_000);
  });

  it('keeps only the preview with retention 0', async () => {
    const t = await setup();
    t.db.prepare('UPDATE users SET photo_retention_days = 0').run();
    const photoId = await t.upload(t.cookie);
    const meal = (await (
      await t.call(t.cookie, 'POST', '/meals', input({ photoId }))
    ).json()) as Meal;
    expect(meal.photo).toEqual({ id: photoId, full: false });
    expect(existsSync(photoPath(t.dataDir, t.adminId, photoId, 'full')!)).toBe(
      false,
    );
    expect(
      existsSync(photoPath(t.dataDir, t.adminId, photoId, 'preview')!),
    ).toBe(true);
    expect(
      t.db.prepare('SELECT photo_expires_at FROM meals').pluck().get(),
    ).toBeNull();
  });

  it('saves a meal without expiry after retention is set to forever', async () => {
    const t = await setup();
    await t.call(t.cookie, 'PUT', '/account/photo-retention', { days: null });
    const photoId = await t.upload(t.cookie);
    const meal = (await (
      await t.call(t.cookie, 'POST', '/meals', input({ photoId }))
    ).json()) as Meal;
    expect(meal.photo).toEqual({ id: photoId, full: true });
    expect(
      t.db.prepare('SELECT photo_expires_at FROM meals').pluck().get(),
    ).toBeNull();
  });

  it('attaches a photo to a saved meal without one (OCT-126)', async () => {
    const t = await setup();
    const meal = (await (
      await t.call(t.cookie, 'POST', '/meals', input())
    ).json()) as Meal;
    const path = `/meals/${meal.id}`;
    const photoId = await t.upload(t.cookie);

    expect(
      (await t.call(t.cookie, 'PATCH', path, { photoId: 'A'.repeat(22) }))
        .status,
    ).toBe(404);
    const other = await t.addUser('b@example.com');
    const foreign = await t.upload(other);
    expect(
      (await t.call(t.cookie, 'PATCH', path, { photoId: foreign })).status,
    ).toBe(404);

    // Same eatenAt in the patch: the period counts once from the new time, not shifted again.
    const res = await t.call(t.cookie, 'PATCH', path, {
      photoId,
      eatenAt: '2026-01-09T12:00:00.000Z',
      tzOffsetMin: 180,
      localDate: '2026-01-09',
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Meal).photo).toEqual({
      id: photoId,
      full: true,
    });
    const expiry = () =>
      t.db.prepare('SELECT photo_expires_at FROM meals').pluck().get();
    expect(expiry()).toBe(
      Date.parse('2026-01-09T12:00:00.000Z') + 30 * 86_400_000,
    );

    // A queue retry with the same id changes nothing.
    expect((await t.call(t.cookie, 'PATCH', path, { photoId })).status).toBe(
      200,
    );
    expect(expiry()).toBe(
      Date.parse('2026-01-09T12:00:00.000Z') + 30 * 86_400_000,
    );

    // The meal already has a photo; the photo is taken by another meal.
    const second = await t.upload(t.cookie);
    const busy = await t.call(t.cookie, 'PATCH', path, { photoId: second });
    expect(busy.status).toBe(409);
    expect(await busy.json()).toEqual({ error: { code: 'photo_in_use' } });
    const bare = (await (
      await t.call(t.cookie, 'POST', '/meals', input())
    ).json()) as Meal;
    expect(
      (await t.call(t.cookie, 'PATCH', `/meals/${bare.id}`, { photoId }))
        .status,
    ).toBe(409);
  });

  it('attaches only the preview with retention 0, and not on a stale edit', async () => {
    const t = await setup();
    t.db.prepare('UPDATE users SET photo_retention_days = 0').run();
    const meal = (await (
      await t.call(t.cookie, 'POST', '/meals', input())
    ).json()) as Meal;
    const path = `/meals/${meal.id}`;
    await t.call(t.cookie, 'PATCH', path, { mealType: 'dinner' });

    const stale = await t.upload(t.cookie);
    await t.call(t.cookie, 'PATCH', path, { photoId: stale, editedAt: 1 });
    expect(t.db.prepare('SELECT photo_id FROM meals').pluck().get()).toBeNull();

    const photoId = await t.upload(t.cookie);
    const res = (await (
      await t.call(t.cookie, 'PATCH', path, { photoId })
    ).json()) as Meal;
    expect(res.photo).toEqual({ id: photoId, full: false });
    expect(existsSync(photoPath(t.dataDir, t.adminId, photoId, 'full')!)).toBe(
      false,
    );
    expect(
      existsSync(photoPath(t.dataDir, t.adminId, photoId, 'preview')!),
    ).toBe(true);
    expect(
      t.db.prepare('SELECT photo_expires_at FROM meals').pluck().get(),
    ).toBeNull();
  });

  it('deletes the meal with its photo files, idempotently (AC-10.5)', async () => {
    const t = await setup();
    const photoId = await t.upload(t.cookie);
    const meal = (await (
      await t.call(t.cookie, 'POST', '/meals', input({ photoId }))
    ).json()) as Meal;
    expect((await t.call(t.cookie, 'DELETE', `/meals/${meal.id}`)).status).toBe(
      204,
    );
    expect((await t.call(t.cookie, 'GET', `/meals/${meal.id}`)).status).toBe(
      404,
    );
    for (const size of ['full', 'preview'] as const)
      expect(existsSync(photoPath(t.dataDir, t.adminId, photoId, size)!)).toBe(
        false,
      );
    expect(t.db.prepare('SELECT COUNT(*) FROM meal_items').pluck().get()).toBe(
      0,
    );
    expect((await t.call(t.cookie, 'DELETE', `/meals/${meal.id}`)).status).toBe(
      204,
    );
    expect((await t.call(t.cookie, 'DELETE', '/meals/999')).status).toBe(204);
  });

  it("deletes a user's meals with the user", async () => {
    const t = await setup();
    await t.call(t.cookie, 'POST', '/meals', input());
    t.db.prepare('DELETE FROM users WHERE id = ?').run(t.adminId);
    expect(t.db.prepare('SELECT COUNT(*) FROM meals').pluck().get()).toBe(0);
    expect(t.db.prepare('SELECT COUNT(*) FROM meal_items').pluck().get()).toBe(
      0,
    );
  });

  it('is 401 without a session', async () => {
    const t = await setup();
    expect((await t.call('', 'POST', '/meals', input())).status).toBe(401);
    expect((await t.call('', 'GET', '/meals/1')).status).toBe(401);
  });
});

describe('previous dishes', () => {
  const DAY = 86_400_000;
  /** Saves a meal with one dish eaten `daysAgo` days ago; returns its id. */
  const eat = async (
    t: Awaited<ReturnType<typeof setup>>,
    cookie: string,
    name: string,
    kcal: number,
    daysAgo: number,
  ) => {
    const res = await t.call(cookie, 'POST', '/meals', {
      ...input(),
      items: [
        {
          name,
          grams: 200,
          kcal,
          proteinG: 5,
          fatG: 3,
          carbsG: 20,
          source: 'manual',
        },
      ],
    });
    const { id } = (await res.json()) as Meal;
    t.db
      .prepare('UPDATE meals SET eaten_at = ? WHERE id = ?')
      .run(Date.now() - daysAgo * DAY, id);
    return id;
  };
  const ask = async (
    t: Awaited<ReturnType<typeof setup>>,
    cookie: string,
    dishes: unknown[],
  ) => {
    const res = await t.call(cookie, 'POST', '/dishes/previous', { dishes });
    return {
      status: res.status,
      body: (await res.json()) as PreviousDishesResponse,
    };
  };

  it('matches by name ignoring case and extra spaces (AC-11.1)', async () => {
    const t = await setup();
    const id = await eat(t, t.cookie, 'Гречка с курицей', 300, 1);
    const { status, body } = await ask(t, t.cookie, [
      { name: '  гречка   С курицей ', kcalPer100: 150 },
      { name: 'Борщ' },
    ]);
    expect(status).toBe(200);
    expect(body).toEqual([
      {
        mealId: id,
        eatenAt: expect.any(String),
        grams: 200,
        unit: 'g',
        kcal: 300,
        proteinG: 5,
        fatG: 3,
        carbsG: 20,
        illustration: 'grains',
      },
      null,
    ]);
  });

  it('skips a newer dish with a different density for an older similar one', async () => {
    const t = await setup();
    const old = await eat(t, t.cookie, 'Салат', 100, 10); // 50 kcal/100 g
    await eat(t, t.cookie, 'Салат', 600, 2); // 300 kcal/100 g
    const { body } = await ask(t, t.cookie, [
      { name: 'Салат', kcalPer100: 55 },
      { name: 'Салат', kcalPer100: 1000 },
    ]);
    expect(body[0]?.mealId).toBe(old);
    expect(body[1]).toBeNull();
  });

  it('without kcalPer100 returns the latest dish by name', async () => {
    const t = await setup();
    await eat(t, t.cookie, 'Чай', 4, 5);
    const latest = await eat(t, t.cookie, 'Чай', 300, 1);
    const { body } = await ask(t, t.cookie, [{ name: 'чай' }]);
    expect(body[0]?.mealId).toBe(latest);
  });

  it('ignores dishes older than 90 days and other users (AC-11.6)', async () => {
    const t = await setup();
    const other = await t.addUser('other@example.com');
    await eat(t, t.cookie, 'Омлет', 300, 91);
    await eat(t, other, 'Омлет', 300, 1);
    const { body } = await ask(t, t.cookie, [{ name: 'Омлет' }]);
    expect(body).toEqual([null]);
  });

  it('accepts 1..20 dishes', async () => {
    const t = await setup();
    expect((await ask(t, t.cookie, [])).status).toBe(400);
    const many = Array.from({ length: 21 }, () => ({ name: 'Чай' }));
    expect((await ask(t, t.cookie, many)).status).toBe(400);
    expect((await ask(t, t.cookie, many.slice(1))).status).toBe(200);
  });
});

describe('illustrations', () => {
  const dish = (name: string, illustration?: string) => ({
    name,
    grams: 100,
    kcal: 100,
    proteinG: 1,
    fatG: 1,
    carbsG: 1,
    source: 'manual',
    ...(illustration && { illustration }),
  });
  const save = async (t: Awaited<ReturnType<typeof setup>>, items: unknown[]) =>
    (await (
      await t.call(t.cookie, 'POST', '/meals', { ...input(), items })
    ).json()) as Meal;
  const read = async (t: Awaited<ReturnType<typeof setup>>, id: number) =>
    (
      (await (await t.call(t.cookie, 'GET', `/meals/${id}`)).json()) as Meal
    ).items.map((i) => i.illustration);
  const choose = (
    t: Awaited<ReturnType<typeof setup>>,
    name: string,
    illustration: string | null,
    cookie = t.cookie,
  ) => t.call(cookie, 'PUT', '/illustrations/choices', { name, illustration });

  it('resolves: dish choice → name choice → match (AC-4.4, 4.7)', async () => {
    const t = await setup();
    const meal = await save(t, [
      dish('Борщ'),
      dish('Борщ', 'pizza'),
      dish('Xyzzy'),
    ]);
    expect(meal.items.map((i) => i.illustration)).toEqual([
      'soup-borscht',
      'pizza',
      'plate',
    ]);
    expect(meal.items.map((i) => i.illustrationManual)).toEqual([
      false,
      true,
      false,
    ]);

    // A choice for the name changes old meals too, but not a dish with its own choice.
    expect((await choose(t, '  БОРЩ ', 'soup')).status).toBe(204);
    expect(await read(t, meal.id)).toEqual(['soup', 'pizza', 'plate']);
    expect(
      (await (
        await t.call(t.cookie, 'GET', '/illustrations/choices')
      ).json()) as unknown,
    ).toEqual([{ nameKey: 'борщ', illustration: 'soup' }]);

    // null brings back the automatic one.
    expect((await choose(t, 'борщ', null)).status).toBe(204);
    expect(await read(t, meal.id)).toEqual(['soup-borscht', 'pizza', 'plate']);
    expect(
      await (await t.call(t.cookie, 'GET', '/illustrations/choices')).json(),
    ).toEqual([]);
  });

  it('renaming a dish without its own choice matches again (AC-4.5)', async () => {
    const t = await setup();
    const meal = await save(t, [dish('Борщ')]);
    await t.call(t.cookie, 'PATCH', `/meals/${meal.id}`, {
      items: [dish('Капучино')],
    });
    expect(await read(t, meal.id)).toEqual(['coffee']);
  });

  it('falls back to the match for an id no longer in the set', async () => {
    const t = await setup();
    const meal = await save(t, [dish('Борщ')]);
    t.db.prepare("UPDATE meal_items SET illustration = 'gone'").run();
    expect(await read(t, meal.id)).toEqual(['soup-borscht']);
  });

  it('returns the resolved illustration for previous dishes (E-6.6)', async () => {
    const t = await setup();
    await save(t, [dish('Салат')]);
    t.db.prepare('UPDATE meals SET eaten_at = ?').run(Date.now());
    await choose(t, 'Салат', 'salad-tomato');
    const res = await t.call(t.cookie, 'POST', '/dishes/previous', {
      dishes: [{ name: 'салат' }],
    });
    expect(
      ((await res.json()) as PreviousDishesResponse)[0]?.illustration,
    ).toBe('salad-tomato');
  });

  it('validates input and keeps choices per user', async () => {
    const t = await setup();
    const other = await t.addUser('other@example.com');
    expect((await save(t, [dish('Борщ')])).id).toBeDefined();
    expect(
      (
        await t.call(t.cookie, 'POST', '/meals', {
          ...input(),
          items: [dish('Борщ', 'nope')],
        })
      ).status,
    ).toBe(400);
    expect((await choose(t, 'Борщ', 'nope')).status).toBe(400);
    expect((await choose(t, ' ', 'soup')).status).toBe(400);
    expect((await choose(t, 'x'.repeat(81), 'soup')).status).toBe(400);
    expect((await choose(t, 'Борщ', 'soup', '')).status).toBe(401);

    await choose(t, 'Борщ', 'soup');
    expect(
      await (await t.call(other, 'GET', '/illustrations/choices')).json(),
    ).toEqual([]);
    const rev = t.db
      .prepare('SELECT rev FROM illustration_choices')
      .pluck()
      .get();
    expect(rev).toBeGreaterThan(0);
  });

  it('an older offline choice does not overwrite a newer one', async () => {
    const t = await setup();
    const put = (illustration: string, editedAt?: number) =>
      t.call(t.cookie, 'PUT', '/illustrations/choices', {
        name: 'Пицца',
        illustration,
        editedAt,
      });
    const state = async () => ({
      choices: await (
        await t.call(t.cookie, 'GET', '/illustrations/choices')
      ).json(),
      sync: (
        (await (await t.call(t.cookie, 'GET', '/sync?since=0')).json()) as {
          changes: unknown[];
        }
      ).changes,
      rev: t.db.prepare('SELECT rev FROM illustration_choices').pluck().get(),
    });
    const now = Date.now();

    expect((await put('soup', now - 1000)).status).toBe(204);
    const before = await state();
    expect(before.choices).toEqual([
      { nameKey: 'пицца', illustration: 'soup' },
    ]);

    // Queued offline earlier: ignored, nothing new to sync.
    expect((await put('pizza', now - 2000)).status).toBe(204);
    expect(await state()).toEqual(before);

    // Newer, or without editedAt: applies.
    await put('salad-tomato', now - 500);
    expect((await state()).choices).toEqual([
      { nameKey: 'пицца', illustration: 'salad-tomato' },
    ]);
    await put('pizza');
    expect((await state()).choices).toEqual([
      { nameKey: 'пицца', illustration: 'pizza' },
    ]);

    // A future editedAt is clamped to now, so it cannot lock the choice.
    await put('soup', now + 3_600_000);
    expect(
      t.db.prepare('SELECT edited_at FROM illustration_choices').pluck().get(),
    ).toBeLessThanOrEqual(Date.now());
    await put('pizza');
    expect((await state()).choices).toEqual([
      { nameKey: 'пицца', illustration: 'pizza' },
    ]);
  });
});

describe('checkWhen', () => {
  const now = Date.parse('2026-01-10T12:00:00Z');

  it('allows the previous day only for 00:00-03:59 local', () => {
    // 03:59 local in UTC+3
    expect(() =>
      checkWhen('2026-01-10T00:59:00Z', 180, '2026-01-09', now),
    ).not.toThrow();
    // 04:00 local
    expect(() =>
      checkWhen('2026-01-10T01:00:00Z', 180, '2026-01-09', now),
    ).toThrow();
    // UTC-5: 20:00 on Jan 9 local
    expect(() =>
      checkWhen('2026-01-10T01:00:00Z', -300, '2026-01-09', now),
    ).not.toThrow();
  });

  it('allows up to 5 minutes in the future', () => {
    expect(() =>
      checkWhen('2026-01-10T12:05:00Z', 0, '2026-01-10', now),
    ).not.toThrow();
    expect(() =>
      checkWhen('2026-01-10T12:05:01Z', 0, '2026-01-10', now),
    ).toThrow();
  });
});
