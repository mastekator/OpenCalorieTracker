import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Meal, MealInput, SyncResponse } from '@oct/shared';
import { ensureAdmin } from '../auth/admin.js';
import { hashPassword } from '../auth/password.js';
import { setCookie, testApp } from '../test/app.js';
import { bumpRev } from './rev.js';

const PASSWORD = 'Correct-horse-battery-9';
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true })));
});

async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), 'oct-sync-'));
  dirs.push(dataDir);
  const t = testApp({ DATA_DIR: dataDir });
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
  const call = async (
    cookie: string,
    method: string,
    path: string,
    body?: unknown,
  ) => {
    const res = await t.app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: res.status,
      body: res.status === 204 ? null : await res.json(),
    };
  };
  const cookie = await signIn('admin@example.com');
  const sync = async (since: number, c = cookie) => {
    const res = await call(c, 'GET', `/sync?since=${since}`);
    expect(res.status).toBe(200);
    return res.body as SyncResponse;
  };
  const addMeal = async (patch: Partial<MealInput> = {}, c = cookie) =>
    (await call(c, 'POST', '/meals', input(patch))).body as Meal;
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
  return { ...t, cookie, call, sync, addMeal, addUser };
}

const input = (patch: Partial<MealInput> = {}): MealInput => ({
  clientId: randomUUID(),
  eatenAt: '2026-01-10T12:00:00.000Z',
  tzOffsetMin: 180,
  localDate: '2026-01-10',
  mealType: 'lunch',
  items: [
    {
      name: 'Борщ',
      grams: 300,
      kcal: 150,
      proteinG: 5,
      fatG: 6,
      carbsG: 15,
      source: 'manual',
    },
  ],
  ...patch,
});

describe('GET /api/sync', () => {
  it('sends everything at since=0, then only what changed', async () => {
    const t = await setup();
    const a = await t.addMeal();
    const b = await t.addMeal();
    await t.call(t.cookie, 'PUT', '/illustrations/choices', {
      name: 'Борщ',
      illustration: 'soup',
    });
    await t.call(t.cookie, 'PATCH', '/account/settings', { theme: 'dark' });

    const first = await t.sync(0);
    expect(first.more).toBe(false);
    expect(first.meals.map((m) => m.clientId)).toEqual([
      a.clientId,
      b.clientId,
    ]);
    expect(first.meals[0]!.items[0]!.illustration).toBe('soup');
    expect(first.deletedMealClientIds).toEqual([]);
    expect(first.illustrationChoices).toEqual([
      { nameKey: 'борщ', illustration: 'soup' },
    ]);
    expect(first.settings).toMatchObject({ theme: 'dark' });
    expect(await t.sync(first.rev)).toEqual({
      rev: first.rev,
      more: false,
      meals: [],
      deletedMealClientIds: [],
    });

    // Edit, delete, a new meal, back to automatic, a settings change: only those come back.
    await t.call(t.cookie, 'PATCH', `/meals/${a.id}`, { mealType: 'dinner' });
    expect((await t.call(t.cookie, 'DELETE', `/meals/${b.id}`)).status).toBe(
      204,
    );
    const c = await t.addMeal();
    await t.call(t.cookie, 'PUT', '/illustrations/choices', {
      name: 'борщ',
      illustration: null,
    });
    await t.call(t.cookie, 'PATCH', '/account/settings', { units: 'us' });

    const next = await t.sync(first.rev);
    expect(next.meals.map((m) => [m.clientId, m.mealType])).toEqual([
      [a.clientId, 'dinner'],
      [c.clientId, 'lunch'],
    ]);
    expect(next.meals[0]!.items[0]!.illustration).toBe('soup-borscht');
    expect(next.deletedMealClientIds).toEqual([b.clientId]);
    expect(next.illustrationChoices).toEqual([
      { nameKey: 'борщ', illustration: null },
    ]);
    expect(next.settings).toMatchObject({ theme: 'dark', units: 'us' });

    // A full reload still knows about the deletion and the reset choice.
    const again = await t.sync(0);
    expect(again.meals.map((m) => m.clientId)).toEqual([
      a.clientId,
      c.clientId,
    ]);
    expect(again.deletedMealClientIds).toEqual([b.clientId]);
  });

  it('pages 501 meals as 500 + 1, settings in rev order', async () => {
    const t = await setup();
    const userId = t.db.prepare('SELECT id FROM users').pluck().get() as number;
    const insert = t.db.prepare(
      `INSERT INTO meals (user_id, client_id, eaten_at, tz_offset_min, local_date, meal_type, rev, created_at, updated_at)
       VALUES (?, ?, 0, 0, '1970-01-01', 'snack', ?, 0, 0)`,
    );
    t.db.transaction(() => {
      for (let i = 0; i < 501; i++)
        insert.run(userId, randomUUID(), bumpRev(t.db, userId));
    })();
    await t.call(t.cookie, 'PATCH', '/account/settings', { theme: 'light' });

    const p1 = await t.sync(0);
    expect(p1.more).toBe(true);
    expect(p1.meals).toHaveLength(500);
    expect(p1.settings).toBeUndefined();
    expect(p1.rev).toBe(500);
    const p2 = await t.sync(p1.rev);
    expect(p2.more).toBe(false);
    expect(p2.meals).toHaveLength(1);
    expect(p2.settings).toMatchObject({ theme: 'light' });
    expect(p2.rev).toBe(502);
  });

  it('a meal re-created after a delete is alive', async () => {
    const t = await setup();
    const body = input();
    const meal = (await t.call(t.cookie, 'POST', '/meals', body)).body as Meal;
    await t.call(t.cookie, 'DELETE', `/meals/${meal.id}`);
    expect((await t.call(t.cookie, 'POST', '/meals', body)).status).toBe(201);
    const res = await t.sync(0);
    expect(res.meals.map((m) => m.clientId)).toEqual([body.clientId]);
    expect(res.deletedMealClientIds).toEqual([]);
  });

  it("never sends another user's data", async () => {
    const t = await setup();
    const other = await t.addUser('other@example.com');
    await t.addMeal({}, other);
    const gone = await t.addMeal({}, other);
    await t.call(other, 'DELETE', `/meals/${gone.id}`);
    await t.call(other, 'PUT', '/illustrations/choices', {
      name: 'Борщ',
      illustration: 'soup',
    });
    await t.call(other, 'PATCH', '/account/settings', { theme: 'dark' });
    expect(await t.sync(0)).toEqual({
      rev: 0,
      more: false,
      meals: [],
      deletedMealClientIds: [],
    });
  });

  it('needs a session and a valid since', async () => {
    const t = await setup();
    expect((await t.call('', 'GET', '/sync?since=0')).status).toBe(401);
    expect((await t.call(t.cookie, 'GET', '/sync?since=-1')).status).toBe(400);
    expect((await t.call(t.cookie, 'GET', '/sync')).status).toBe(400);
  });
});

describe('PATCH /api/meals/:id editedAt', () => {
  it('ignores an edit older than the stored one, applies an equal one', async () => {
    const t = await setup();
    const meal = await t.addMeal();
    const now = Date.now();
    const edit = (mealType: string, editedAt: number) =>
      t.call(t.cookie, 'PATCH', `/meals/${meal.id}`, { mealType, editedAt });

    expect((await edit('dinner', now - 1000)).body).toMatchObject({
      mealType: 'dinner',
    });
    const old = await edit('snack', now - 2000);
    expect(old.status).toBe(200);
    expect(old.body).toMatchObject({ mealType: 'dinner' });
    expect((await edit('breakfast', now - 1000)).body).toMatchObject({
      mealType: 'breakfast',
    });
    // Unchanged meals do not move the rev.
    const { rev } = await t.sync(0);
    await edit('snack', now - 5000);
    expect((await t.sync(rev)).meals).toEqual([]);
  });

  it('clamps a future editedAt to server time', async () => {
    const t = await setup();
    const meal = await t.addMeal();
    await t.call(t.cookie, 'PATCH', `/meals/${meal.id}`, {
      mealType: 'dinner',
      editedAt: Date.now() + 86_400_000,
    });
    const res = await t.call(t.cookie, 'PATCH', `/meals/${meal.id}`, {
      mealType: 'snack',
    });
    expect(res.body).toMatchObject({ mealType: 'snack' });
  });
});
