import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiSetup } from '../test/ai.js';
import { FOUND_TTL, MISSING_TTL } from './lookup.js';
import { parseOffProduct } from './off.js';

const CODE = '4006381333931';
const OFF_PRODUCT = {
  product_name: 'Choco bar',
  product_name_ru: 'Шоколадка',
  brands: 'Acme, Acme Foods',
  nutriments: {
    'energy-kcal_100g': 530,
    proteins_100g: 6,
    fat_100g: 30,
    carbohydrates_100g: 58,
  },
  serving_quantity: '25',
  serving_size: '1 bar (25 g)',
  product_quantity: '100',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function setup(
  answer: () => Promise<Response> = async () =>
    json({ status: 1, product: OFF_PRODUCT }),
  env: Record<string, string> = {},
) {
  const fetchFn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    () => answer(),
  );
  const t = await aiSetup(null, env, fetchFn as unknown as typeof fetch);
  cleanup = t.cleanup;
  const user = await t.signIn('b@example.com');
  const userId = t.db
    .prepare("SELECT id FROM users WHERE email = 'b@example.com'")
    .pluck()
    .get() as number;
  const enable = () =>
    t.db.prepare('UPDATE users SET off_enabled = 1 WHERE id = ?').run(userId);
  const get = (path: string, cookie = user) =>
    t.app.request(path, { headers: cookie ? { cookie } : {} });
  const lookup = async (code = CODE) =>
    (await get(`/api/barcodes/${code}`)).json();
  return { ...t, fetchFn, user, userId, enable, get, lookup };
}

describe('parseOffProduct', () => {
  it('converts kJ to kcal, keeps ml and drops an out-of-range serving', () => {
    expect(
      parseOffProduct({
        product_name: 'Juice',
        nutriments: { energy_100g: 184 },
        product_quantity_unit: 'ml',
        serving_quantity: 2500,
      }),
    ).toEqual({
      names: { default: 'Juice' },
      brand: null,
      kcal100: 44,
      protein100: null,
      fat100: null,
      carbs100: null,
      per: 'ml',
      servingG: null,
      servingText: null,
      packG: null,
    });
    expect(parseOffProduct({ serving_quantity: 0.5 }).servingG).toBeNull();
  });

  it.each([
    ['grams', { product_quantity: '400' }, 400],
    ['ml', { product_quantity: 1000, product_quantity_unit: 'ml' }, 1000],
    ['zero', { product_quantity: 0 }, null],
    ['over 5 kg', { product_quantity: 6000 }, null],
    ['text', { product_quantity: '500 g' }, null],
    ['no field', {}, null],
  ])('reads the package weight: %s', (_, p, packG) => {
    expect(parseOffProduct(p).packG).toBe(packG);
  });
});

describe('GET /api/barcodes/:code (ADR-0034 §3, §4)', () => {
  it('needs a session and a valid code', async () => {
    const t = await setup();
    expect((await t.get(`/api/barcodes/${CODE}`, '')).status).toBe(401);
    const res = await t.get('/api/barcodes/4006381333932');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'barcode_invalid' } });
  });

  it('does not ask OFF when the admin forbids outbound requests', async () => {
    const t = await setup(undefined, { ALLOW_OUTBOUND_REQUESTS: 'false' });
    t.enable();
    expect(await t.lookup()).toEqual({
      product: null,
      from: null,
      off: 'blocked',
    });
    expect(t.fetchFn).not.toHaveBeenCalled();
  });

  it('does not ask OFF until the user turns it on (AC-0.1)', async () => {
    const t = await setup();
    expect((await t.lookup()).off).toBe('disabled');
    expect(t.fetchFn).not.toHaveBeenCalled();
  });

  it('sends only the code and names the product in the user language (AC-4.10, AC-4.12)', async () => {
    const t = await setup();
    t.enable();
    expect(await t.lookup()).toEqual({
      product: {
        code: CODE,
        name: 'Choco bar',
        brand: 'Acme',
        kcal100: 530,
        protein100: 6,
        fat100: 30,
        carbs100: 58,
        per: 'g',
        servingG: 25,
        servingText: '1 bar (25 g)',
        packG: 100,
        pieces: null,
        last: null,
      },
      from: 'off',
      off: 'found',
    });
    const [url, init] = t.fetchFn.mock.calls[0]!;
    expect(url).toBe(
      `https://world.openfoodfacts.org/api/v2/product/${CODE}.json?fields=product_name,product_name_en,product_name_ru,brands,nutriments,serving_quantity,serving_size,product_quantity,product_quantity_unit`,
    );
    expect(Object.keys(init!.headers!)).toEqual(['user-agent']);
    expect((init!.headers as Record<string, string>)['user-agent']).toMatch(
      /^OpenCalorieTracker\/[\d.]+ \(\+https:\/\/github\.com\/mastekator\/OpenCalorieTracker\)$/,
    );

    t.db.prepare("UPDATE users SET locale = 'ru' WHERE id = ?").run(t.userId);
    expect((await t.lookup()).product).toMatchObject({
      name: 'Шоколадка',
      packG: 100,
    });
    // Served from the cache.
    expect(t.fetchFn).toHaveBeenCalledTimes(1);
  });

  it('asks OFF again once the cache expires', async () => {
    const t = await setup();
    t.enable();
    await t.lookup();
    t.db
      .prepare('UPDATE food_products SET fetched_at = ?')
      .run(Date.now() - FOUND_TTL - 1);
    expect((await t.lookup()).off).toBe('found');
    expect(t.fetchFn).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['404', () => json({ status: 0 }, 404)],
    [
      'status: 0',
      () => json({ status: 0, status_verbose: 'product not found' }),
    ],
  ])('treats %s as missing and caches it for a day', async (_, answer) => {
    const t = await setup(async () => answer());
    t.enable();
    expect(await t.lookup()).toEqual({
      product: null,
      from: null,
      off: 'missing',
    });
    expect((await t.lookup()).off).toBe('missing');
    expect(t.fetchFn).toHaveBeenCalledTimes(1);
    t.db
      .prepare('UPDATE food_products SET fetched_at = ?')
      .run(Date.now() - MISSING_TTL - 1);
    await t.lookup();
    expect(t.fetchFn).toHaveBeenCalledTimes(2);
  });

  it('answers down on errors and serves a stale product then', async () => {
    let answer: () => Promise<Response> = async () => json({}, 503);
    const t = await setup(() => answer());
    t.enable();
    expect(await t.lookup()).toEqual({
      product: null,
      from: null,
      off: 'down',
    });
    answer = async () => json({ status: 1, product: OFF_PRODUCT });
    await t.lookup();
    t.db
      .prepare('UPDATE food_products SET fetched_at = ?')
      .run(Date.now() - FOUND_TTL - 1);
    answer = () => Promise.reject(new DOMException('timeout', 'TimeoutError'));
    const stale = await t.lookup();
    expect(stale.off).toBe('down');
    expect(stale.product.name).toBe('Choco bar');
  });

  it('shares one request between concurrent lookups of a code', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = await setup(async () => {
      await gate;
      return json({ status: 1, product: OFF_PRODUCT });
    });
    t.enable();
    const both = Promise.all([t.lookup(), t.lookup()]);
    await vi.waitFor(() => expect(t.fetchFn).toHaveBeenCalled());
    release();
    const [a, b] = await both;
    expect(a).toEqual(b);
    expect(a.off).toBe('found');
    expect(t.fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('own products (E-8)', () => {
  it('win over OFF, are listed and go with the user', async () => {
    const t = await setup();
    t.enable();
    t.db
      .prepare(
        `INSERT INTO user_products (user_id, code, name, kcal_100, per, created_at, updated_at)
         VALUES (?, ?, 'My bar', 400, 'g', 0, 0)`,
      )
      .run(t.userId, CODE);
    const mine = {
      code: CODE,
      name: 'My bar',
      brand: null,
      kcal100: 400,
      protein100: null,
      fat100: null,
      carbs100: null,
      per: 'g',
      servingG: null,
      servingText: null,
      packG: null,
      pieces: null,
      last: null,
      savedAt: '1970-01-01T00:00:00.000Z',
    };
    expect(await t.lookup()).toEqual({
      product: mine,
      from: 'mine',
      off: 'skipped',
    });
    expect(t.fetchFn).not.toHaveBeenCalled();
    expect(await (await t.get('/api/products/mine')).json()).toEqual({
      products: [mine],
    });
    expect((await t.get('/api/products/mine', '')).status).toBe(401);

    t.db.prepare('DELETE FROM users WHERE id = ?').run(t.userId);
    expect(
      t.db.prepare('SELECT COUNT(*) FROM user_products').pluck().get(),
    ).toBe(0);
  });
});

describe('POST /photos/:id/barcodes', () => {
  it('reads the code from the photo and looks it up without AI; 404 for another user', async () => {
    const t = await setup();
    t.enable();
    const photo = await readFile(
      join(import.meta.dirname, 'fixtures', 'ean13.jpg'),
    );
    const upload = await t.app.request('/api/photos', {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', cookie: t.user },
      body: new Uint8Array(photo),
    });
    const { photoId } = (await upload.json()) as { photoId: string };
    const post = (id: string, cookie = t.user) =>
      t.app.request(`/api/photos/${id}/barcodes`, {
        method: 'POST',
        headers: { cookie, origin: 'http://localhost:3000' },
      });

    const res = await post(photoId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      codes: [{ code: CODE, result: await t.lookup() }],
    });
    expect(t.fetchFn).toHaveBeenCalledTimes(1);

    expect((await post(photoId, t.cookie)).status).toBe(404);
    expect((await post('A'.repeat(22))).status).toBe(404);
    expect((await post('bad')).status).toBe(404);
  });
});
