import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Meal, MealInput, SyncResponse } from '@oct/shared';
import { openUserDb, type Db } from './db';
import {
  createMeal,
  deleteMeal,
  flush,
  mealStatus,
  patchMeal,
  patchSettings,
  pendingCount,
  putIllustrationChoice,
} from './outbox';
import { clearLocal } from './user';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

const item = (name: string, kcal: number) => ({
  name,
  grams: 100,
  kcal,
  proteinG: 1,
  fatG: 2,
  carbsG: 3,
  source: 'manual' as const,
});

const input = (clientId: string, kcal = 100): MealInput => ({
  clientId,
  eatenAt: '2026-11-14T12:00:00.000Z',
  tzOffsetMin: 0,
  localDate: '2026-11-14',
  mealType: 'lunch',
  items: [item('Soup', kcal)],
});

const empty: SyncResponse = {
  rev: 1,
  more: false,
  meals: [],
  deletedMealClientIds: [],
};

type Handler = (body: unknown) => Response | Promise<Response>;
const offline: Handler = () => Promise.reject(new TypeError('offline'));
const status = (code: number, error = 'validation_failed') =>
  Response.json({ error: { code: error } }, { status: code });

let nextId = 41;
/** The server's meal for a POST body. */
const created = (body: unknown) => {
  const b = body as MealInput;
  return Response.json(
    {
      id: ++nextId,
      clientId: b.clientId,
      photo: b.photoId ? { id: b.photoId, full: true } : null,
    } as Meal,
    { status: 201 },
  );
};

let calls: [string, unknown][] = [];
let routes: Record<string, Handler>;
/** Routes by `METHOD path`; unlisted ones are offline. Records calls from now on. */
function serve(r: Record<string, Handler>) {
  calls = [];
  routes = r;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const key = `${init.method} ${url}`;
      const body =
        typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      calls.push([key, body]);
      if (key.startsWith('GET /api/sync')) return Response.json(empty);
      return (routes[key] ?? offline)(body);
    }),
  );
}
const sent = () => calls.map(([k]) => k);

let db: Db;
/** Lets the background flush finish (offline: it fails and schedules a retry). */
const settle = () => flush(db).catch(() => {});
const ops = () => db.getAll('outbox');

beforeEach(async () => {
  serve({});
  db = await openUserDb(7);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  db.close();
  await clearLocal(7);
});

describe('local write and merge', () => {
  it('createMeal writes the local copy and queues the op', async () => {
    await createMeal(db, {
      ...input(A),
      items: [item('Soup', 100), item('Bread', 50)],
    });
    await settle();
    const meal = (await db.get('meals', A))!;
    expect(meal).toMatchObject({ id: 0, kcal: 150, proteinG: 2, photo: null });
    expect(meal.items[0]).toMatchObject({
      illustration: 'soup',
      illustrationManual: false,
    });
    expect(await ops()).toMatchObject([{ kind: 'createMeal', clientId: A }]);
    expect(await mealStatus(db, A)).toBe('pending');
    expect(await pendingCount(db)).toBe(1);
  });

  it('an edit of an unsent meal goes into its createMeal', async () => {
    await createMeal(db, input(A));
    await settle();
    await patchMeal(db, A, { mealType: 'dinner', items: [item('Soup', 300)] });
    await settle();
    expect(await ops()).toMatchObject([
      {
        kind: 'createMeal',
        body: { mealType: 'dinner', items: [{ kcal: 300 }] },
      },
    ]);
    expect(await db.get('meals', A)).toMatchObject({
      mealType: 'dinner',
      kcal: 300,
    });
  });

  it('deleting an unsent meal drops both ops', async () => {
    await createMeal(db, input(A));
    await settle();
    await deleteMeal(db, A);
    await settle();
    expect(await ops()).toEqual([]);
    expect(await db.get('meals', A)).toBeUndefined();
  });

  it('edit + edit of a saved meal is one op with the latest editedAt', async () => {
    await db.put('meals', { ...(await localMeal(A)), id: 5 });
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await patchMeal(db, A, { mealType: 'dinner' });
    await settle();
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    await patchMeal(db, A, { recalcOffer: true });
    await settle();
    vi.restoreAllMocks();
    expect(await ops()).toMatchObject([
      {
        kind: 'patchMeal',
        id: 5,
        body: { mealType: 'dinner', recalcOffer: true, editedAt: 2000 },
      },
    ]);
  });

  it('settings and illustration choices merge by key', async () => {
    await patchSettings(db, { theme: 'dark' });
    await settle();
    await patchSettings(db, { locale: 'ru' });
    await putIllustrationChoice(db, 'Soup ', 'pizza');
    await settle();
    await putIllustrationChoice(db, 'soup', null);
    await settle();
    expect(await ops()).toMatchObject([
      { kind: 'patchSettings', body: { theme: 'dark', locale: 'ru' } },
      {
        kind: 'putIllustrationChoice',
        body: { name: 'soup', illustration: null },
      },
    ]);
    expect(await db.get('kv', 'choices')).toEqual({});
  });
});

/** A local copy made by createMeal, without its op. */
async function localMeal(clientId: string) {
  await createMeal(db, input(clientId));
  await settle();
  await db.clear('outbox');
  return (await db.get('meals', clientId))!;
}

describe('flush', () => {
  it('sends in order, then pulls', async () => {
    await createMeal(db, input(A));
    await createMeal(db, input(B));
    await settle();
    await patchSettings(db, { theme: 'dark' });
    await settle();
    serve({
      'POST /api/meals': created,
      'PATCH /api/account/settings': () => Response.json({}),
    });
    await flush(db);
    expect(sent()).toEqual([
      'POST /api/meals',
      'POST /api/meals',
      'PATCH /api/account/settings',
      'GET /api/sync?since=0',
    ]);
    expect(calls.slice(0, 2).map(([, b]) => (b as MealInput).clientId)).toEqual(
      [A, B],
    );
    expect(await ops()).toEqual([]);
    expect(await mealStatus(db, A)).toBe('synced');
  });

  it('a break after the server saved a meal resends the same clientId', async () => {
    serve({ 'POST /api/meals': async (b) => (await created(b), offline(b)) });
    await createMeal(db, input(A));
    await settle();
    expect(calls[0]).toEqual(['POST /api/meals', input(A)]);
    serve({ 'POST /api/meals': created });
    await flush(db);
    expect(calls[0]).toEqual(['POST /api/meals', input(A)]);
    expect(await db.getAllKeys('meals')).toEqual([A]);
    expect(await ops()).toEqual([]);
  });

  it('a meal deleted while its createMeal is in flight is deleted by server id', async () => {
    let answer!: () => void;
    serve({
      'POST /api/meals': (b) =>
        new Promise((r) => (answer = () => r(created(b)))),
      'DELETE /api/meals/42': () => new Response(null, { status: 204 }),
    });
    nextId = 41;
    await createMeal(db, input(A));
    await vi.waitFor(() => expect(answer).toBeDefined());
    await deleteMeal(db, A);
    expect(await ops()).toMatchObject([
      { kind: 'createMeal' },
      { kind: 'deleteMeal', id: 0 },
    ]);
    answer();
    await settle();
    expect(sent()).toContain('DELETE /api/meals/42');
    expect(await ops()).toEqual([]);
    expect(await db.get('meals', A)).toBeUndefined();
  });

  it('drops an edit or delete answered 404', async () => {
    await db.put('meals', { ...(await localMeal(A)), id: 5 });
    await db.put('meals', { ...(await localMeal(B)), id: 6 });
    await patchMeal(db, A, { mealType: 'dinner' });
    await deleteMeal(db, B);
    await settle();
    serve({
      'PATCH /api/meals/5': () => status(404, 'not_found'),
      'DELETE /api/meals/6': () => status(404, 'not_found'),
    });
    await flush(db);
    expect(await ops()).toEqual([]);
  });

  it('marks a refused createMeal and the meal’s later ops, and goes on', async () => {
    await createMeal(db, input(A));
    await settle();
    serve({ 'POST /api/meals': () => status(400) });
    await flush(db);
    // Made after the refusal: never goes out with id 0.
    await patchMeal(db, A, { mealType: 'dinner' });
    await patchSettings(db, { theme: 'dark' });
    serve({ 'PATCH /api/account/settings': () => Response.json({}) });
    await settle();
    expect(sent()).toContain('PATCH /api/account/settings');
    expect(sent()).not.toContain('POST /api/meals');
    expect(sent()).not.toContain('PATCH /api/meals/0');
    expect(await ops()).toMatchObject([
      { kind: 'createMeal', error: 'validation_failed' },
      { kind: 'patchMeal', id: 0, error: 'validation_failed' },
    ]);
    expect(await mealStatus(db, A)).toBe('error');
    expect(await pendingCount(db)).toBe(2);
  });

  it('stops on 401 and on client_outdated', async () => {
    await createMeal(db, input(A));
    await createMeal(db, input(B));
    await settle();
    serve({ 'POST /api/meals': () => status(401, 'unauthenticated') });
    await flush(db);
    expect(sent()).toEqual(['POST /api/meals']);
    expect(await pendingCount(db)).toBe(2);

    vi.stubGlobal('location', { reload: () => {} });
    serve({ 'POST /api/meals': () => status(409, 'client_outdated') });
    await flush(db);
    await flush(db);
    expect(sent()).toEqual(['POST /api/meals']);
    expect(await pendingCount(db)).toBe(2);
  });

  it('retries a network error or 5xx after 5 s, then 10 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    serve({ 'POST /api/meals': () => status(503, 'internal') });
    // Queued directly: no flush of its own, so the tries are countable.
    await db.add('outbox', { kind: 'createMeal', clientId: A, body: input(A) });
    await settle();
    const tries = () => sent().filter((k) => k === 'POST /api/meals').length;
    expect(tries()).toBe(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(tries()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(tries()).toBe(2);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(tries()).toBe(2);
    serve({ 'POST /api/meals': created });
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(tries()).toBe(1)); // the third try, by the timer
    expect(await ops()).toEqual([]);
  });

  it('uploads a photo taken offline and puts its id into the meal', async () => {
    const photo = new Blob(['jpeg'], { type: 'image/jpeg' });
    await createMeal(db, input(A), photo);
    await settle();
    expect(await db.count('photos')).toBe(1);
    serve({
      'POST /api/photos': () =>
        Response.json({ photoId: 'p1' }, { status: 201 }),
      'POST /api/meals': created,
    });
    await flush(db);
    expect(sent().slice(0, 2)).toEqual(['POST /api/photos', 'POST /api/meals']);
    expect(calls[1]![1]).toMatchObject({ clientId: A, photoId: 'p1' });
    expect(await db.count('photos')).toBe(0);
    expect(await db.get('meals', A)).toMatchObject({ photo: { id: 'p1' } });
  });
});
