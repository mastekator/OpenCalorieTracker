import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import type { Recipe, SyncResponse } from '@oct/shared';
import { PILAF, SALAD } from '../features/kitchen/fixtures';
import { byLastLogged, deleteRecipe } from './DataContext';
import { dbName, openUserDb, type Db } from './db';
import { pull } from './sync';
import { photoIds } from './thumbs';
import { clearLocal } from './user';

const page = (p: Partial<SyncResponse>): SyncResponse => ({
  rev: 1,
  more: false,
  meals: [],
  deletedMealClientIds: [],
  ...p,
});

let db: Db | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  db?.close();
  db = undefined;
  await clearLocal(7);
});

describe('recipes in the local copy (ADR-0023 §4)', () => {
  it('a pull stores recipes and drops tombstoned ones', async () => {
    db = await openUserDb(7);
    const pages = [
      page({ rev: 1, recipes: [PILAF, SALAD] }),
      page({
        rev: 2,
        recipes: [{ ...SALAD, name: 'Salad' }],
        deletedRecipeIds: [PILAF.id],
      }),
    ];
    vi.stubGlobal('fetch', async () => Response.json(pages.shift()));
    await pull(db);
    expect(await db.getAllKeys('recipes')).toEqual([1, 2]);
    await pull(db);
    expect(await db.getAll('recipes')).toEqual([{ ...SALAD, name: 'Salad' }]);
  });

  it('upgrading from version 2 keeps meals and weighings', async () => {
    const old = await openDB(dbName(7), 2, {
      upgrade(d) {
        d.createObjectStore('meals', { keyPath: 'clientId' }).createIndex(
          'localDate',
          'localDate',
        );
        d.createObjectStore('outbox', {
          keyPath: 'seq',
          autoIncrement: true,
        }).createIndex('clientId', 'clientId');
        d.createObjectStore('kv');
        d.createObjectStore('photos');
        d.createObjectStore('weighings', { keyPath: 'date' });
      },
    });
    await old.put('meals', { clientId: 'a', localDate: '2026-11-19' });
    await old.put('weighings', { date: '2026-11-19', weightKg: 80 });
    old.close();
    db = await openUserDb(7);
    expect(await db.getAllKeys('meals')).toEqual(['a']);
    expect(await db.getAllKeys('weighings')).toEqual(['2026-11-19']);
    expect(await db.getAll('recipes')).toEqual([]);
  });
});

describe('deleteRecipe', () => {
  const answer = (status: number) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        status === 204
          ? new Response(null, { status })
          : Response.json(
              { error: { code: status === 404 ? 'not_found' : 'internal' } },
              { status },
            ),
      ),
    );

  it('sends DELETE and drops the recipe from the copy', async () => {
    db = await openUserDb(7);
    await db.put('recipes', PILAF);
    answer(204);
    await deleteRecipe(db, PILAF.id);
    expect(vi.mocked(fetch).mock.calls[0]).toMatchObject([
      '/api/recipes/1',
      { method: 'DELETE' },
    ]);
    expect(await db.get('recipes', PILAF.id)).toBeUndefined();
  });

  it('404: already gone elsewhere, dropped here too', async () => {
    db = await openUserDb(7);
    await db.put('recipes', PILAF);
    answer(404);
    await deleteRecipe(db, PILAF.id);
    expect(await db.get('recipes', PILAF.id)).toBeUndefined();
  });

  it('any other failure keeps the copy and throws', async () => {
    db = await openUserDb(7);
    await db.put('recipes', PILAF);
    answer(500);
    await expect(deleteRecipe(db, PILAF.id)).rejects.toThrow();
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    await expect(deleteRecipe(db, PILAF.id)).rejects.toThrow();
    expect(await db.get('recipes', PILAF.id)).toEqual(PILAF);
  });
});

it('byLastLogged: recently logged first, then never logged by last edit', () => {
  const r = (id: number, lastLoggedAt: string | null, updatedAt: string) =>
    ({ id, lastLoggedAt, updatedAt }) as Recipe;
  const list = [
    r(1, null, '2026-11-01T00:00:00Z'),
    r(2, '2026-11-10T00:00:00Z', '2026-11-01T00:00:00Z'),
    r(3, null, '2026-11-05T00:00:00Z'),
    r(4, '2026-11-18T00:00:00Z', '2026-11-01T00:00:00Z'),
  ];
  expect(list.sort(byLastLogged).map((x) => x.id)).toEqual([4, 2, 3, 1]);
});

it('photoIds: meal, recipe and step photos', () => {
  expect(photoIds([], [PILAF, SALAD])).toEqual([
    'plov.jpg',
    'pilaf-and-meat.jpg',
  ]);
});
