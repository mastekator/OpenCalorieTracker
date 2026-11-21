import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyMealPatch,
  sameMealContent,
  type Meal,
  type MealInput,
  type MealPatch,
} from '@oct/shared';
import { openUserDb, type Db } from './db';
import {
  conflictCount,
  conflictOf,
  createMeal,
  deleteConflicted,
  flush,
  keepMine,
  keepTheirs,
  mealStatus,
  patchMeal,
  restoreMine,
} from './outbox';
import { pull } from './sync';
import { clearLocal } from './user';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const HOUR = 3_600_000;

const dish = (name: string, grams = 100): Meal['items'][number] => ({
  name,
  grams,
  unit: 'g',
  kcal: grams,
  proteinG: 1,
  fatG: 2,
  carbsG: 3,
  source: 'manual',
  aiProvider: null,
  aiModel: null,
  confidence: null,
  recipeId: null,
  barcode: null,
  illustration: 'soup',
  illustrationManual: false,
});

const input = (name: string) => ({
  name,
  grams: 100,
  kcal: 100,
  proteinG: 1,
  fatG: 2,
  carbsG: 3,
  source: 'manual' as const,
});

const base: Meal = {
  id: 5,
  clientId: A,
  eatenAt: '2026-11-14T12:00:00.000Z',
  tzOffsetMin: 0,
  localDate: '2026-11-14',
  mealType: 'lunch',
  photo: null,
  recalcOffer: false,
  items: [dish('Soup')],
  kcal: 100,
  proteinG: 1,
  fatG: 2,
  carbsG: 3,
  editRev: 1,
  editedAt: 0,
};

/** One server with revisions, as meals/routes.ts decides a PATCH (ADR-0022 §2). */
let server: {
  rev: number;
  meal: Meal | null;
  deleted: boolean;
  online: boolean;
  /** The PATCH is applied, then the answer is lost. */
  lose: boolean;
  /** Holds PATCH answers until released. */
  hold?: Promise<void>;
};
const calls: [string, unknown][] = [];
const error = (status: number, code: string, details?: unknown) =>
  Response.json({ error: { code, details } }, { status });

async function handle(key: string, body: unknown): Promise<Response> {
  if (key.startsWith('GET /api/sync')) {
    const since = Number(
      new URL(key.slice(4), 'http://x').searchParams.get('since'),
    );
    const m = server.meal;
    return Response.json({
      rev: server.rev,
      more: false,
      meals: m && m.editRev! > since ? [m] : [],
      deletedMealClientIds: server.deleted ? [A] : [],
    });
  }
  if (key === 'POST /api/meals') {
    const { clientId, photoId, ...rest } = body as MealInput;
    if (server.meal?.clientId !== clientId || server.deleted)
      server.meal = {
        ...base,
        ...rest,
        clientId,
        id: server.meal && !server.deleted ? server.meal.id : 6,
        photo: photoId ? { id: photoId, full: true } : null,
        items: rest.items.map((i) => ({
          ...dish(i.name),
          ...i,
        })) as Meal['items'],
        editRev: ++server.rev,
      };
    server.deleted = false;
    return Response.json(server.meal, { status: 201 });
  }
  if (key.startsWith('PATCH /api/meals/')) {
    await server.hold;
    const patch = body as MealPatch;
    const m = server.meal;
    if (!m || server.deleted) return error(404, 'not_found');
    let next = m;
    if (patch.baseRev !== undefined && patch.baseRev !== m.editRev) {
      if (!sameMealContent(applyMealPatch(m, patch), m))
        return error(409, 'edit_conflict', { meal: m });
    } else if (patch.baseRev !== undefined || patch.editedAt! >= m.editedAt!) {
      const c = applyMealPatch(m, patch);
      next = server.meal = {
        ...m,
        ...c,
        photo: c.photo && { id: c.photo.id, full: true },
        items: c.items.map((i) => ({ ...dish(i.name), ...i })),
        editRev: ++server.rev,
        editedAt: patch.editedAt,
      };
    }
    if (server.lose) {
      server.lose = false;
      throw new TypeError('connection lost');
    }
    return Response.json(next);
  }
  if (key.startsWith('DELETE /api/meals/')) {
    server.deleted = true;
    server.rev++;
    return new Response(null, { status: 204 });
  }
  throw new TypeError('offline');
}

let one: Db;
let two: Db;
/** Lets a background flush finish; offline it fails and schedules a retry. */
const settle = (db: Db) => flush(db).catch(() => {});
const ops = (db: Db) => db.getAll('outbox');
const patches = () => calls.filter(([k]) => k.startsWith('PATCH'));

beforeEach(async () => {
  server = { rev: 1, meal: base, deleted: false, online: false, lose: false };
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (!server.online) throw new TypeError('offline');
      const key = `${init.method} ${url}`;
      const body =
        typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      calls.push([key, body]);
      return handle(key, body);
    }),
  );
  one = await openUserDb(7);
  two = await openUserDb(8);
  for (const db of [one, two]) {
    await db.put('meals', base);
    await db.put('kv', 1, 'rev');
  }
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  one.close();
  two.close();
  await clearLocal(7);
  await clearLocal(8);
});

/** Both devices edit offline, then come online one after the other. */
async function editBoth(skew = [0, 0]) {
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now + skew[0]!);
  await patchMeal(one, A, { mealType: 'dinner' });
  await settle(one);
  vi.spyOn(Date, 'now').mockReturnValue(now + skew[1]!);
  await patchMeal(two, A, { mealType: 'snack' });
  await settle(two);
  vi.restoreAllMocks();
  server.online = true;
  await flush(one);
  await flush(two);
}

describe('baseRev and parked ops (ADR-0022 §3)', () => {
  it.each([
    ['same clocks', [0, 0]],
    ['the first device hours behind', [-5 * HOUR, 0]],
    ['the second device hours ahead', [0, 5 * HOUR]],
  ])(
    'two offline edits: only the second device has a conflict (%s)',
    async (_, skew) => {
      await editBoth(skew);
      expect(patches().map(([, b]) => (b as MealPatch).baseRev)).toEqual([
        1, 1,
      ]);
      expect(server.meal).toMatchObject({ mealType: 'dinner', editRev: 2 });
      expect(await mealStatus(one, A)).toBe('synced');
      expect(await mealStatus(two, A)).toBe('conflict');
      expect(await conflictCount(two)).toBe(1);
      // The parked op is not sent again, and the local copy stays mine.
      expect(patches()).toHaveLength(2);
      expect(await two.get('meals', A)).toMatchObject({ mealType: 'snack' });
      // The answer of a PATCH and a pull give the same editRev: the choice is not falsely stale.
      const c = await conflictOf(two, A);
      expect(c).toMatchObject({ kind: 'edit', theirs: { mealType: 'dinner' } });
      expect((await one.get('meals', A))!.editRev).toBe(2);
      if (c?.kind === 'edit') expect(c.theirs.editRev).toBe(2);
    },
  );

  it('a repeat of an applied edit after a lost answer is not a conflict', async () => {
    server.online = true;
    server.lose = true;
    await patchMeal(one, A, { mealType: 'dinner' });
    await settle(one);
    expect(await ops(one)).toHaveLength(1);
    await flush(one);
    expect(patches()).toHaveLength(2);
    expect(await ops(one)).toEqual([]);
    expect(await mealStatus(one, A)).toBe('synced');
  });

  it('an edit made while a PATCH is in flight builds on its answer', async () => {
    server.online = true;
    let release = () => {};
    server.hold = new Promise((r) => (release = r));
    await patchMeal(one, A, { mealType: 'dinner' });
    await vi.waitFor(() => expect(patches()).toHaveLength(1));
    await patchMeal(one, A, { mealType: 'snack' });
    release();
    await settle(one);
    expect(patches().map(([, b]) => (b as MealPatch).baseRev)).toEqual([1, 2]);
    expect(server.meal).toMatchObject({ mealType: 'snack', editRev: 3 });
    expect(await ops(one)).toEqual([]);
  });

  it('a conflict does not hold the rest of the queue; new edits go into the parked op', async () => {
    await editBoth();
    await createMeal(two, { ...base, clientId: B, items: [input('Tea')] });
    await settle(two);
    expect(
      calls.some(
        ([k, b]) => k === 'POST /api/meals' && (b as MealInput).clientId === B,
      ),
    ).toBe(true);
    await patchMeal(two, A, { recalcOffer: true });
    await settle(two);
    expect(await ops(two)).toMatchObject([
      {
        kind: 'patchMeal',
        conflict: { kind: 'edit' },
        body: { mealType: 'snack', recalcOffer: true, baseRev: 1 },
      },
    ]);
    expect(patches()).toHaveLength(2);
  });

  it('an edit against a delete is `deleted`; restore creates the meal again with the same clientId', async () => {
    server.deleted = true;
    await patchMeal(two, A, { mealType: 'snack' });
    server.online = true;
    await settle(two);
    const c = await conflictOf(two, A);
    expect(c).toMatchObject({ kind: 'deleted' });
    expect(await two.get('meals', A)).toMatchObject({ mealType: 'snack' });
    expect(await restoreMine(two, A, c!)).toBe('done');
    await settle(two);
    expect(calls.filter(([k]) => k === 'POST /api/meals')).toMatchObject([
      ['POST /api/meals', { clientId: A, mealType: 'snack' }],
    ]);
    expect(server).toMatchObject({
      deleted: false,
      meal: { id: 6, mealType: 'snack' },
    });
    expect(await two.get('meals', A)).toMatchObject({
      id: 6,
      mealType: 'snack',
    });
    expect(await mealStatus(two, A)).toBe('synced');
  });

  it('a pull brings the newest version into the conflict; a stale choice is not applied', async () => {
    await editBoth();
    const shown = (await conflictOf(two, A))!;
    await patchMeal(one, A, { mealType: 'breakfast' });
    await settle(one);
    await pull(two);
    const now = (await conflictOf(two, A))!;
    expect(now).toMatchObject({
      kind: 'edit',
      theirs: { mealType: 'breakfast', editRev: 3 },
    });
    expect(await keepTheirs(two, A, shown)).toBe('stale');
    expect(await two.get('meals', A)).toMatchObject({ mealType: 'snack' });
    expect(await keepTheirs(two, A, now)).toBe('done');
    expect(await two.get('meals', A)).toMatchObject({
      mealType: 'breakfast',
      editRev: 3,
    });
    expect(await ops(two)).toEqual([]);
  });

  it('a delete pulled in turns the conflict into `deleted` and keeps the local copy', async () => {
    await editBoth();
    server.deleted = true;
    server.rev++;
    await pull(two);
    expect(await conflictOf(two, A)).toMatchObject({ kind: 'deleted' });
    expect(await two.get('meals', A)).toMatchObject({ mealType: 'snack' });
  });

  it('keep mine sends the whole local version on top of theirs', async () => {
    await editBoth();
    const c = (await conflictOf(two, A))!;
    expect(await keepMine(two, A, c)).toBe('done');
    await settle(two);
    expect(patches().at(-1)![1]).toMatchObject({
      baseRev: 2,
      mealType: 'snack',
      eatenAt: base.eatenAt,
      items: [{ name: 'Soup', source: 'manual' }],
    });
    expect(server.meal).toMatchObject({ mealType: 'snack', editRev: 3 });
    expect(await mealStatus(two, A)).toBe('synced');
  });

  it('delete removes the meal there; deleted there already, only the local copy goes', async () => {
    await editBoth();
    expect(await deleteConflicted(two, A, (await conflictOf(two, A))!)).toBe(
      'done',
    );
    await settle(two);
    expect(server.deleted).toBe(true);
    expect(await two.get('meals', A)).toBeUndefined();

    server.deleted = false;
    await two.put('meals', base);
    await patchMeal(two, A, { items: [input('Bread')] });
    server.deleted = true;
    await settle(two);
    calls.length = 0;
    expect(await deleteConflicted(two, A, (await conflictOf(two, A))!)).toBe(
      'done',
    );
    await settle(two);
    expect(calls.some(([k]) => k.startsWith('DELETE'))).toBe(false);
    expect(await ops(two)).toEqual([]);
  });
});
