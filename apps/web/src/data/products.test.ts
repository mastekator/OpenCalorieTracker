import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@oct/shared';
import { openUserDb, type Db } from './db';
import { lookupProduct, refreshMyProducts } from './products';
import { clearLocal } from './user';

const product = (code: string, name: string): Product => ({
  code,
  name,
  brand: null,
  kcal100: 66,
  protein100: 8,
  fat100: 2,
  carbs100: 4,
  per: 'g',
  servingG: 140,
  servingText: null,
});
const YOGURT = product('4006381333931', 'Greek yogurt');

let db: Db | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  db?.close();
  db = undefined;
  await clearLocal(7);
});

const answer = (body: unknown) =>
  vi.stubGlobal('fetch', async () => Response.json(body));

describe('lookupProduct', () => {
  it('keeps a found product, then finds it offline (AC-4.9)', async () => {
    db = await openUserDb(7);
    answer({ product: YOGURT, from: 'off', off: 'found' });
    expect(await lookupProduct(db, YOGURT.code)).toMatchObject({
      from: 'off',
    });
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect(await lookupProduct(db, YOGURT.code)).toEqual({
      product: YOGURT,
      from: 'local',
      off: 'offline',
    });
    expect(await lookupProduct(db, '96385074')).toEqual({
      product: null,
      from: null,
      off: 'offline',
    });
  });

  it('lookup off: own products on this device still answer', async () => {
    db = await openUserDb(7);
    await db.put('products', YOGURT);
    answer({ product: null, from: null, off: 'disabled' });
    expect(await lookupProduct(db, YOGURT.code)).toEqual({
      product: YOGURT,
      from: 'local',
      off: 'disabled',
    });
  });

  it('a server error reads as Open Food Facts down; not found stores nothing', async () => {
    db = await openUserDb(7);
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }));
    expect((await lookupProduct(db, YOGURT.code)).off).toBe('down');
    answer({ product: null, from: null, off: 'missing' });
    expect(await lookupProduct(db, YOGURT.code)).toEqual({
      product: null,
      from: null,
      off: 'missing',
    });
    expect(await db.count('products')).toBe(0);
  });
});

it('refreshMyProducts stores the own products', async () => {
  db = await openUserDb(7);
  const mine = { ...product('96385074', 'Granola'), savedAt: '2026-11-20' };
  answer({ products: [mine] });
  await refreshMyProducts(db);
  expect(await db.get('products', mine.code)).toEqual(mine);
});
