import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import type {
  Meal,
  MealInput,
  ProfileResponse,
  SyncResponse,
} from '@oct/shared';
import { dbName, openUserDb, type Db } from './db';
import {
  createMeal,
  deleteMeal,
  deleteWeighing,
  expiringPhotos,
  flush,
  mealStatus,
  patchMeal,
  patchSettings,
  pendingCount,
  putAwards,
  putChallengeMonth,
  putIllustrationChoice,
  putPhotoRetention,
  putWeighing,
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
/** As if the failed send never left the device: the server cannot have the meal. */
async function unsend() {
  for (const o of await ops()) {
    delete o.sent;
    await db.put('outbox', o);
  }
}

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
    await unsend();
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
    await unsend();
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

  it('`pack` goes to the server and to the product here, offline too, not into the meal (AC-5.3, AC-5.4)', async () => {
    const code = '4607012345678';
    await db.put('products', {
      code,
      name: 'Oat cookies',
      brand: null,
      kcal100: 440,
      protein100: 6,
      fat100: 16,
      carbs100: 68,
      per: 'g',
      servingG: 30,
      servingText: null,
      packG: null,
      pieces: null,
    });
    const dish = (pack: NonNullable<MealInput['items'][number]['pack']>) => ({
      ...item('Oat cookies', 440),
      source: 'barcode' as const,
      barcode: code,
      pack,
    });
    await createMeal(db, {
      ...input(A),
      items: [dish({ packG: 200, amount: { mode: 'pack', value: 0.5 } })],
    });
    await settle();
    expect(await ops()).toMatchObject([
      { kind: 'createMeal', body: { items: [{ pack: { packG: 200 } }] } },
    ]);
    expect((await db.get('meals', A))!.items[0]).not.toHaveProperty('pack');
    expect(await db.get('products', code)).toMatchObject({
      packG: 200,
      pieces: null,
      last: { mode: 'pack', value: 0.5 },
    });

    await db.put('meals', { ...(await localMeal(B)), id: 5 });
    await patchMeal(db, B, {
      items: [dish({ pieces: 12, amount: { mode: 'piece', value: 2 } })],
    });
    await settle();
    expect((await ops()).at(-1)).toMatchObject({
      kind: 'patchMeal',
      body: { items: [{ pack: { pieces: 12 } }] },
    });
    expect((await db.get('meals', B))!.items[0]).not.toHaveProperty('pack');
    expect(await db.get('products', code)).toMatchObject({
      packG: 200,
      pieces: 12,
      last: { mode: 'piece', value: 2 },
    });
  });

  it("a manual dish with a code not stored yet becomes the user's product here, with its pack (OCT-419)", async () => {
    const code = '4607012345678';
    await createMeal(db, {
      ...input(A),
      items: [
        {
          ...item('Muesli', 180),
          grams: 50,
          unit: 'ml',
          barcode: code,
          pack: { packG: 400, pieces: 8 },
        },
      ],
    });
    await settle();
    expect(await db.get('products', code)).toMatchObject({
      code,
      name: 'Muesli',
      brand: null,
      kcal100: 360,
      protein100: 2,
      fat100: 4,
      carbs100: 6,
      per: 'ml',
      servingG: null,
      packG: 400,
      pieces: 8,
      last: undefined,
    });
    expect((await db.get('products', code))!.savedAt).toEqual(
      expect.any(String),
    );
  });

  it('a photo attached to a saved meal shows in the local copy (OCT-126)', async () => {
    await db.put('meals', { ...(await localMeal(A)), id: 5 });
    await patchMeal(db, A, { photoId: 'p1' });
    await settle();
    const meal = await db.get('meals', A);
    expect(meal?.photo).toEqual({ id: 'p1', full: true });
    expect(meal).not.toHaveProperty('photoId');
    expect(await ops()).toMatchObject([
      { kind: 'patchMeal', id: 5, body: { photoId: 'p1' } },
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

  it('stamps a choice when picked; a merged choice takes the last editedAt', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    await putIllustrationChoice(db, 'Soup', 'pizza');
    await settle();
    now.mockReturnValue(2000);
    await putIllustrationChoice(db, 'soup', 'soup');
    now.mockRestore();
    await settle();
    expect(await ops()).toMatchObject([
      {
        kind: 'putIllustrationChoice',
        body: { name: 'soup', illustration: 'soup', editedAt: 2000 },
      },
    ]);
  });
});

describe('photo retention', () => {
  it('one op, the last choice wins, sent as PUT', async () => {
    await db.put('kv', { photoRetentionDays: 30 } as never, 'settings');
    await putPhotoRetention(db, 7);
    await settle();
    await putPhotoRetention(db, null);
    await settle();
    expect(await ops()).toMatchObject([
      { kind: 'putPhotoRetention', body: { days: null } },
    ]);
    expect(await db.get('kv', 'settings')).toEqual({
      photoRetentionDays: null,
    });
    serve({ 'PUT /api/account/photo-retention': () => Response.json({}) });
    await flush(db);
    expect(calls[0]).toEqual([
      'PUT /api/account/photo-retention',
      { days: null },
    ]);
    expect(await ops()).toEqual([]);
  });

  it('counts full photos older than the period by meal time', async () => {
    const now = Date.parse('2026-11-14T12:00:00.000Z');
    const day = 86_400_000;
    const meal = (clientId: string, ago: number, full = true) =>
      ({
        clientId,
        eatenAt: new Date(now - ago * day).toISOString(),
        photo: { id: clientId, full },
      }) as Meal;
    for (const m of [
      meal('a', 1),
      meal('b', 10),
      meal('c', 40),
      meal('d', 40, false),
    ])
      await db.put('meals', m);
    expect(await expiringPhotos(db, 0, now)).toBe(3);
    expect(await expiringPhotos(db, 7, now)).toBe(2);
    expect(await expiringPhotos(db, 30, now)).toBe(1);
    expect(await expiringPhotos(db, 90, now)).toBe(0);
    expect(await expiringPhotos(db, null, now)).toBe(0);
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

  it('a meal saved offline goes later with its own loggedAt and an AI dish marks the copy (ADR-0032 §2)', async () => {
    const loggedAt = '2026-11-14T12:05:00.000Z';
    const ai = { ...item('Rice', 200), source: 'ai' as const, aiGrams: 150 };
    await createMeal(db, { ...input(A), loggedAt, items: [ai] });
    await settle();
    expect(await db.get('meals', A)).toMatchObject({
      loggedAt,
      recognized: true,
      items: [{ aiGrams: 150 }],
    });
    serve({ 'POST /api/meals': created });
    await flush(db);
    expect(calls[0]).toEqual([
      'POST /api/meals',
      { ...input(A), loggedAt, items: [ai] },
    ]);
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

  /** A createMeal the server saved (id 42) but whose answer was lost. */
  async function lostAnswer() {
    nextId = 41;
    serve({ 'POST /api/meals': async (b) => (await created(b), offline(b)) });
    await createMeal(db, input(A));
    await settle();
    serve({}); // still offline for the edit or delete
    nextId = 41; // the resend finds the same meal by clientId
  }

  it('an edit after a lost createMeal answer goes out as a PATCH', async () => {
    await lostAnswer();
    await patchMeal(db, A, { mealType: 'dinner' });
    expect(await ops()).toMatchObject([
      { kind: 'createMeal', body: { mealType: 'lunch' }, sent: true },
      { kind: 'patchMeal', id: 0, body: { mealType: 'dinner' } },
    ]);
    serve({
      'POST /api/meals': created,
      'PATCH /api/meals/42': (b) =>
        Response.json({ id: 42, clientId: A, ...(b as object) }),
    });
    await flush(db);
    expect(sent()).toEqual([
      'POST /api/meals',
      'PATCH /api/meals/42',
      'GET /api/sync?since=0',
    ]);
    expect(await db.get('meals', A)).toMatchObject({
      id: 42,
      mealType: 'dinner',
    });
    expect(await ops()).toEqual([]);
  });

  it('a delete after a lost createMeal answer deletes the meal on the server', async () => {
    await lostAnswer();
    await deleteMeal(db, A);
    expect(await ops()).toMatchObject([
      { kind: 'createMeal' },
      { kind: 'deleteMeal', id: 0 },
    ]);
    serve({
      'POST /api/meals': created,
      'DELETE /api/meals/42': () => new Response(null, { status: 204 }),
    });
    await flush(db);
    expect(sent().slice(0, 2)).toEqual([
      'POST /api/meals',
      'DELETE /api/meals/42',
    ]);
    expect(await db.get('meals', A)).toBeUndefined();
    expect(await ops()).toEqual([]);
  });

  it('an edit then a delete after a lost createMeal answer sends no PATCH', async () => {
    await lostAnswer();
    await patchMeal(db, A, { mealType: 'dinner' });
    await deleteMeal(db, A);
    serve({
      'POST /api/meals': created,
      'DELETE /api/meals/42': () => new Response(null, { status: 204 }),
    });
    await flush(db);
    expect(sent().slice(0, 2)).toEqual([
      'POST /api/meals',
      'DELETE /api/meals/42',
    ]);
    expect(sent().some((k) => k.startsWith('PATCH'))).toBe(false);
    expect(await db.get('meals', A)).toBeUndefined();
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

  it('an edit after a failed in-flight createMeal stays after the earlier edit', async () => {
    let fail!: () => void;
    serve({
      'POST /api/meals': () =>
        new Promise((_, no) => (fail = () => no(new TypeError('offline')))),
    });
    await createMeal(db, input(A));
    await vi.waitFor(() => expect(fail).toBeDefined());
    await patchMeal(db, A, { mealType: 'dinner' });
    serve({}); // the retry stays offline
    fail();
    await settle();
    await patchMeal(db, A, { mealType: 'snack' });
    await settle();
    expect(await ops()).toMatchObject([
      { kind: 'createMeal', body: { mealType: 'lunch' } },
      { kind: 'patchMeal', body: { mealType: 'snack' } },
    ]);
  });

  it('drops a delete answered 404 and parks an edit as `deleted` (ADR-0022 §3)', async () => {
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
    expect(await ops()).toMatchObject([
      { kind: 'patchMeal', clientId: A, conflict: { kind: 'deleted' } },
    ]);
    expect(await db.get('meals', A)).toMatchObject({ mealType: 'dinner' });
  });

  it('marks a refused createMeal and the meal’s later ops, and goes on', async () => {
    await createMeal(db, input(A));
    await settle(); // offline: marked sent, so the edit is an op of its own
    await patchMeal(db, A, { mealType: 'dinner' });
    await settle();
    serve({ 'POST /api/meals': () => status(400) });
    await flush(db);
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

  it('saving a refused meal again sends it with the edits folded in', async () => {
    await createMeal(db, input(A));
    await settle();
    serve({ 'POST /api/meals': () => status(400) });
    await flush(db);
    await patchMeal(db, A, { mealType: 'dinner' }); // sent again, refused again
    await settle();
    expect(await mealStatus(db, A)).toBe('error');
    serve({ 'POST /api/meals': created });
    // The fixed time, as the edit screen sends it.
    const when = {
      eatenAt: '2026-11-14T11:00:00.000Z',
      tzOffsetMin: 0,
      localDate: '2026-11-14',
    };
    await patchMeal(db, A, { mealType: 'dinner', ...when });
    await settle();
    expect(sent().filter((k) => !k.includes('/sync'))).toEqual([
      'POST /api/meals',
    ]);
    expect(calls[0]![1]).toMatchObject({
      mealType: 'dinner',
      eatenAt: '2026-11-14T11:00:00.000Z',
    });
    expect(sent()).not.toContain('PATCH /api/meals/0');
    expect(await mealStatus(db, A)).toBe('synced');
  });

  it('saving again after a refused edit sends the edit again', async () => {
    await db.put('meals', { ...(await localMeal(A)), id: 5 });
    await patchMeal(db, A, { mealType: 'dinner' });
    serve({ 'PATCH /api/meals/5': () => status(400) });
    await settle();
    expect(await mealStatus(db, A)).toBe('error');
    serve({ 'PATCH /api/meals/5': () => Response.json({ id: 5 }) });
    await patchMeal(db, A, {});
    await settle();
    expect(calls[0]).toMatchObject([
      'PATCH /api/meals/5',
      { mealType: 'dinner' },
    ]);
    expect(await mealStatus(db, A)).toBe('synced');
  });

  it('saving again after a refused photo drops it and its blob', async () => {
    await createMeal(db, input(A), new Blob(['bad'], { type: 'image/jpeg' }));
    serve({ 'POST /api/photos': () => status(422, 'photo_invalid') });
    await settle();
    expect(await mealStatus(db, A)).toBe('error');
    serve({ 'POST /api/meals': created });
    await patchMeal(db, A, {});
    await settle();
    expect(sent().filter((k) => !k.includes('/sync'))).toEqual([
      'POST /api/meals',
    ]);
    expect((calls[0]![1] as MealInput).photoId).toBeUndefined();
    expect(await db.count('photos')).toBe(0);
    expect(await mealStatus(db, A)).toBe('synced');
  });

  it('drops a refused createMeal of a meal already deleted here', async () => {
    await createMeal(db, input(A));
    await settle(); // offline: marked sent, so the delete keeps it
    await deleteMeal(db, A);
    serve({ 'POST /api/meals': () => status(400) });
    await flush(db);
    expect(sent()).not.toContain('DELETE /api/meals/0');
    expect(await pendingCount(db)).toBe(0);
  });

  it('drops refused settings and choices and takes the server values back', async () => {
    await db.put(
      'kv',
      { theme: 'light', photoRetentionDays: 30 } as never,
      'settings',
    );
    await db.put('kv', { fish: 'fish' }, 'choices');
    await patchSettings(db, { theme: 'dark' });
    await putPhotoRetention(db, 7);
    await putIllustrationChoice(db, 'Soup', 'pizza');
    await settle();
    serve({
      'PATCH /api/account/settings': () => status(400),
      'PUT /api/account/photo-retention': () => status(400),
      'PUT /api/illustrations/choices': () => status(400),
      'GET /api/account/settings': () =>
        Response.json({ theme: 'light', photoRetentionDays: 30 }),
      'GET /api/illustrations/choices': () =>
        Response.json([{ nameKey: 'soup', illustration: 'soup' }]),
    });
    await flush(db);
    expect(await ops()).toEqual([]);
    expect(await pendingCount(db)).toBe(0);
    expect(await db.get('kv', 'settings')).toEqual({
      theme: 'light',
      photoRetentionDays: 30,
    });
    expect(await db.get('kv', 'choices')).toEqual({
      fish: 'fish',
      soup: 'soup',
    });
  });

  it('a refused settings op keeps the local value while a newer one waits', async () => {
    await db.put('kv', { theme: 'light' } as never, 'settings');
    await patchSettings(db, { theme: 'dark' });
    await settle();
    serve({
      'PATCH /api/account/settings': () => status(400),
      // Offline photo retention stays queued, so the server's settings must not land.
      'GET /api/account/settings': () => Response.json({ theme: 'light' }),
    });
    await putPhotoRetention(db, 7);
    await settle();
    expect(await ops()).toMatchObject([{ kind: 'putPhotoRetention' }]);
    expect(await db.get('kv', 'settings')).toEqual({
      theme: 'dark',
      photoRetentionDays: 7,
    });
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

describe('weighings', () => {
  const profile = (weightKg: number | null, rev = 3) =>
    ({
      profile: { weightKg, birthDate: null },
      manual: null,
      rev,
    }) as ProfileResponse;
  const weight = async () =>
    ((await db.get('kv', 'profile')) as ProfileResponse).profile.weightKg;

  it('offline put, edit and delete show at once and go out online', async () => {
    await db.put('kv', profile(80), 'profile');
    await putWeighing(db, '2026-11-14', 79);
    await settle();
    await putWeighing(db, '2026-11-14', 78.5);
    await putWeighing(db, '2026-11-15', 78);
    await settle();
    await deleteWeighing(db, '2026-11-15');
    await settle();
    expect(await db.getAll('weighings')).toEqual([
      { date: '2026-11-14', weightKg: 78.5 },
    ]);
    expect(await ops()).toMatchObject([
      { kind: 'putWeighing', body: { date: '2026-11-14', weightKg: 78.5 } },
      { kind: 'deleteWeighing', date: '2026-11-15' },
    ]);
    serve({
      'PUT /api/weighings/2026-11-14': (b) =>
        Response.json({ weighing: b, profile: profile(78.5, 4) }),
      'DELETE /api/weighings/2026-11-15': () =>
        Response.json({ profile: profile(78.5, 5) }),
    });
    await flush(db);
    expect(calls.slice(0, 2)).toEqual([
      ['PUT /api/weighings/2026-11-14', { weightKg: 78.5 }],
      ['DELETE /api/weighings/2026-11-15', undefined],
    ]);
    expect(await ops()).toEqual([]);
    expect(await db.get('kv', 'profile')).toEqual(profile(78.5, 5));
  });

  it('the profile weight follows the latest weighing at once, not a backdated one', async () => {
    await db.put('kv', profile(80), 'profile');
    await putWeighing(db, '2026-11-14', 79);
    await settle();
    expect(await weight()).toBe(79);
    expect(((await db.get('kv', 'profile')) as ProfileResponse).rev).toBe(3);
    await putWeighing(db, '2026-11-10', 82);
    await settle();
    expect(await weight()).toBe(79);
    await deleteWeighing(db, '2026-11-14');
    await settle();
    expect(await weight()).toBe(82);
    await deleteWeighing(db, '2026-11-10');
    await settle();
    expect(await weight()).toBe(82); // no weighings left: the profile keeps its weight
  });

  it('keeps the weight of a queued weighing over the server answer', async () => {
    await db.put('kv', profile(80), 'profile');
    await putWeighing(db, '2026-11-13', 79);
    await putWeighing(db, '2026-11-14', 78);
    await settle();
    serve({
      'PUT /api/weighings/2026-11-13': () =>
        Response.json({ profile: profile(79, 4) }),
    });
    await flush(db);
    expect(await weight()).toBe(78);
  });

  it('marks a refused weighing; a new value for the day replaces it', async () => {
    await putWeighing(db, '2026-11-14', 79);
    await settle();
    serve({ 'PUT /api/weighings/2026-11-14': () => status(400) });
    await flush(db);
    expect(await ops()).toMatchObject([
      { kind: 'putWeighing', error: 'validation_failed' },
    ]);
    expect(await db.get('weighings', '2026-11-14')).toBeDefined();
    serve({});
    await putWeighing(db, '2026-11-14', 78);
    await settle();
    expect(await ops()).toEqual([
      expect.objectContaining({
        kind: 'putWeighing',
        body: { date: '2026-11-14', weightKg: 78 },
      }),
    ]);
    expect((await ops())[0]!.error).toBeUndefined();
  });
});

describe('awards and challenge months', () => {
  const award = (key: string, earnedOn: string, seen = false) => ({
    key,
    earnedOn,
    seen,
  });

  it('show at once, merge into one op and store the server answer', async () => {
    await putAwards(db, [award('days_1', '2026-11-05')]);
    await settle();
    await putAwards(db, [
      award('days_1', '2026-11-03'),
      award('days_30', '2026-11-20'),
    ]);
    await settle();
    expect(await db.getAll('awards')).toEqual([
      award('days_1', '2026-11-03'),
      award('days_30', '2026-11-20'),
    ]);
    expect(await ops()).toMatchObject([
      {
        kind: 'putAwards',
        clientId: 'awards',
        body: [award('days_1', '2026-11-03'), award('days_30', '2026-11-20')],
      },
    ]);
    serve({
      'PUT /api/awards': () =>
        Response.json({
          awards: [
            award('days_1', '2026-11-01', true),
            award('days_30', '2026-11-20'),
          ],
        }),
    });
    await flush(db);
    expect(calls[0]![0]).toBe('PUT /api/awards');
    expect(await ops()).toEqual([]);
    expect(await db.get('awards', 'days_1')).toEqual(
      award('days_1', '2026-11-01', true),
    );
  });

  it('a month from two devices converges on the server keys', async () => {
    await putChallengeMonth(db, '2026-11', {
      keys: ['days_20', 'photo_20'],
      done: { days_20: '2026-11-25' },
      closed: false,
    });
    await settle();
    expect(await db.get('challengeMonths', '2026-11')).toEqual({
      month: '2026-11',
      keys: ['days_20', 'photo_20'],
      done: { days_20: '2026-11-25' },
      closed: false,
    });
    // The other device stored its set first.
    const server = {
      month: '2026-11',
      keys: ['days_20', 'grams_10', 'profile'],
      done: { days_20: '2026-11-25' },
      closed: false,
    };
    serve({ 'PUT /api/challenges/2026-11': () => Response.json(server) });
    await flush(db);
    expect(calls[0]).toEqual([
      'PUT /api/challenges/2026-11',
      {
        keys: ['days_20', 'photo_20'],
        done: { days_20: '2026-11-25' },
        closed: false,
      },
    ]);
    expect(await db.get('challengeMonths', '2026-11')).toEqual(server);
    expect(await ops()).toEqual([]);
    // Later puts keep the stored keys and only merge done.
    serve({});
    await putChallengeMonth(db, '2026-11', {
      keys: ['photo_20'],
      done: { profile: '2026-11-26', days_20: '2026-11-27' },
      closed: true,
    });
    await settle();
    expect(await db.get('challengeMonths', '2026-11')).toEqual({
      ...server,
      done: { days_20: '2026-11-25', profile: '2026-11-26' },
      closed: true,
    });
  });

  it('drops a refused op', async () => {
    await putAwards(db, [award('days_1', '2026-11-05')]);
    await settle();
    serve({ 'PUT /api/awards': () => status(400) });
    await flush(db);
    expect(await ops()).toEqual([]);
  });
});

describe('upgrade from version 1', () => {
  it('keeps meals and the queue and adds the later stores', async () => {
    db.close();
    await clearLocal(7);
    const v1 = await openDB(dbName(7), 1, {
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
      },
    });
    await v1.put('meals', { clientId: A, localDate: '2026-11-14' });
    await v1.add('outbox', { kind: 'deleteMeal', clientId: A, id: 5 });
    v1.close();
    db = await openUserDb(7);
    expect(await db.get('meals', A)).toMatchObject({ clientId: A });
    expect(await ops()).toMatchObject([{ kind: 'deleteMeal', id: 5 }]);
    expect(await db.count('weighings')).toBe(0);
    expect(await db.count('awards')).toBe(0);
    expect(await db.count('challengeMonths')).toBe(0);
  });
});
