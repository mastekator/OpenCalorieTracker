import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SYNC_PAGE_SIZE,
  addDays,
  type Drink,
  type Meal,
  type MealInput,
  type SyncResponse,
} from '@oct/shared';
import { ensureAdmin } from '../auth/admin.js';
import { hashPassword } from '../auth/password.js';
import { migrate } from '../db/migrate.js';
import { serverToday } from '../profile/routes.js';
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

const TODAY = serverToday();

const LATTE = {
  name: 'Latte',
  illustration: 'coffee',
  kcal: 50,
  proteinG: 3,
  fatG: 2,
  carbsG: 5,
  countsWater: false,
};
const entry = () => ({
  clientId: randomUUID(),
  date: TODAY,
  takenAt: '2026-01-01T08:00:00.000Z',
  ml: 200,
  drinkKey: 'water',
});

const PROFILE = {
  sex: 'female',
  birthDate: '1990-05-01',
  heightCm: 165,
  weightKg: 70,
  activity: 'moderate',
  goal: 'maintain',
  targetWeightKg: null,
  deadline: null,
};

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
  it('sends never-changed settings on the first load', async () => {
    const t = await setup();
    const first = await t.sync(0);
    expect(first).toMatchObject({ rev: 0, settings: { settingsRev: 0 } });
    await t.addMeal();
    expect((await t.sync(1)).settings).toBeUndefined();
  });

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
    await t.call(other, 'PUT', '/profile', { profile: PROFILE, manual: null });
    await t.call(other, 'PUT', `/weighings/${TODAY}`, { weightKg: 71 });
    await t.call(other, 'DELETE', `/weighings/${TODAY}`);
    await t.call(other, 'POST', '/drinks', LATTE);
    await t.call(other, 'POST', '/drink-entries', entry());
    await t.call(other, 'PUT', '/water/goal', { date: TODAY, goalMl: 2500 });
    expect(await t.sync(0)).toEqual({
      rev: 0,
      more: false,
      meals: [],
      deletedMealClientIds: [],
      settings: expect.objectContaining({ theme: 'system', settingsRev: 0 }),
    });
  });

  it('sends the profile after a save, not when unchanged or never saved', async () => {
    const t = await setup();
    expect((await t.sync(0)).profile).toBeUndefined();
    const before = (await t.sync(0)).rev;
    const saved = await t.call(t.cookie, 'PUT', '/profile', {
      profile: PROFILE,
      manual: null,
    });
    const next = await t.sync(before);
    expect(next.profile).toEqual(saved.body);
    expect(next.rev).toBe(saved.body.rev);
    expect((await t.sync(next.rev)).profile).toBeUndefined();
  });

  it('sends normDisclaimerHidden in settings', async () => {
    const t = await setup();
    const rev = (await t.sync(0)).rev;
    await t.call(t.cookie, 'PATCH', '/account/settings', {
      normDisclaimerHidden: true,
    });
    expect((await t.sync(rev)).settings).toMatchObject({
      normDisclaimerHidden: true,
    });
  });

  it('sends new, changed and deleted weighings by since', async () => {
    const t = await setup();
    const day = (n: number) => addDays(TODAY, -n);
    const put = (n: number, weightKg: number) =>
      t.call(t.cookie, 'PUT', `/weighings/${day(n)}`, { weightKg });
    expect((await put(2, 71)).status).toBe(200);
    await put(1, 70.5);
    const first = await t.sync(0);
    expect(first.weighings).toEqual([
      { date: day(2), weightKg: 71 },
      { date: day(1), weightKg: 70.5 },
    ]);
    expect((await t.sync(first.rev)).weighings).toBeUndefined();

    await put(2, 71.2);
    await put(0, 70);
    const next = await t.sync(first.rev);
    expect(next.weighings).toEqual([
      { date: day(2), weightKg: 71.2 },
      { date: day(0), weightKg: 70 },
    ]);

    // Deleting an older day leaves the profile weight (latest day) as is: only the deletion comes.
    expect(
      (await t.call(t.cookie, 'DELETE', `/weighings/${day(2)}`)).status,
    ).toBe(200);
    expect(await t.sync(next.rev)).toEqual({
      rev: next.rev + 1,
      more: false,
      meals: [],
      deletedMealClientIds: [],
      weighings: [{ date: day(2), weightKg: null }],
    });
    expect((await t.sync(0)).weighings).toContainEqual({
      date: day(2),
      weightKg: null,
    });
  });

  it('a page can end on a weighing', async () => {
    const t = await setup();
    const userId = t.db.prepare('SELECT id FROM users').pluck().get() as number;
    const insert = t.db.prepare(
      'INSERT INTO weighings (user_id, date, weight_kg, rev, updated_at) VALUES (?, ?, 70, ?, 0)',
    );
    t.db.transaction(() => {
      for (let i = 0; i <= SYNC_PAGE_SIZE; i++)
        insert.run(userId, addDays('2020-01-01', i), bumpRev(t.db, userId));
    })();
    // Never-changed settings (rev 0) take the first slot of the first page.
    const p1 = await t.sync(0);
    expect(p1.more).toBe(true);
    expect(p1.settings).toBeDefined();
    expect(p1.weighings).toHaveLength(SYNC_PAGE_SIZE - 1);
    expect(p1.rev).toBe(SYNC_PAGE_SIZE - 1);
    const p2 = await t.sync(p1.rev);
    expect(p2.more).toBe(false);
    expect(p2.weighings).toEqual(
      [SYNC_PAGE_SIZE - 1, SYNC_PAGE_SIZE].map((i) => ({
        date: addDays('2020-01-01', i),
        weightKg: 70,
      })),
    );
  });

  it('sends the weighing moved from the profile by migration 0009 at since=0', async () => {
    const t = await setup();
    const userId = t.db.prepare('SELECT id FROM users').pluck().get() as number;
    t.db
      .prepare(
        'INSERT INTO profiles (user_id, weight_kg, updated_at) VALUES (?, 72.5, ?)',
      )
      .run(userId, Date.now());
    // Replay 0009 (and the migrations after it) over a profile saved before it existed.
    t.db.exec(
      'DROP TABLE weighings; DROP TABLE ai_settings; DROP TABLE setup_code; DROP TABLE ai_test_runs; DROP TABLE ai_limits; ' +
        'DROP TABLE recipe_tombstones; DROP TABLE recipe_steps; DROP TABLE recipe_ingredients; DROP TABLE recipes; ' +
        'DROP TABLE edible_prefs; DROP TABLE product_prefs; DROP TABLE user_products; DROP TABLE food_products; DROP TABLE integration_settings; ALTER TABLE users DROP COLUMN off_enabled; ALTER TABLE users DROP COLUMN off_hint_at; ALTER TABLE meals DROP COLUMN edit_rev; ALTER TABLE users DROP COLUMN last_export_at; ALTER TABLE users DROP COLUMN last_export_format; DROP INDEX meals_import; ALTER TABLE meals DROP COLUMN import_id; DROP TABLE imports; DROP TABLE api_tokens; ALTER TABLE users DROP COLUMN time_zone; DROP TABLE webhook_schedule; DROP TABLE webhook_deliveries; DROP TABLE webhook_outbox; DROP TABLE webhooks; ALTER TABLE users DROP COLUMN mcp_enabled; DROP TABLE ai_consents; ALTER TABLE meals DROP COLUMN ai_source; ALTER TABLE users DROP COLUMN ai_notice_seen; DROP TABLE instance_ai; DROP TABLE user_ai_settings; ALTER TABLE meal_items DROP COLUMN ai_grams; ALTER TABLE meals DROP COLUMN logged_at; ALTER TABLE meals DROP COLUMN recognized; DROP TABLE water_goals; DROP TABLE drink_entries; DROP TABLE drinks; ALTER TABLE users DROP COLUMN hidden_drinks; ALTER TABLE users DROP COLUMN water_enabled; DROP TABLE challenge_months; DROP TABLE awards; ALTER TABLE users DROP COLUMN streaks_enabled; DROP TABLE chatgpt_auth',
    );
    t.db.pragma('user_version = 8');
    migrate(t.db);
    const rev = t.db
      .prepare('SELECT rev FROM weighings WHERE user_id = ?')
      .pluck()
      .get(userId) as number;
    expect(rev).toBeGreaterThan(0);
    const res = await t.sync(0);
    expect(res.weighings).toEqual([{ date: TODAY, weightKg: 72.5 }]);
    expect(rev).toBeLessThanOrEqual(res.rev);
    expect((await t.sync(res.rev)).weighings).toBeUndefined();
  });

  it('sends new, changed and deleted drinks, drink entries and water goals by since', async () => {
    const t = await setup();
    const drink = (await t.call(t.cookie, 'POST', '/drinks', LATTE))
      .body as Drink;
    const water = entry();
    await t.call(t.cookie, 'POST', '/drink-entries', water);
    await t.call(t.cookie, 'PUT', '/water/goal', {
      date: TODAY,
      goalMl: 2500,
    });
    const first = await t.sync(0);
    expect(first.drinks).toEqual([drink]);
    expect(first.drinkEntries).toEqual([
      expect.objectContaining({ clientId: water.clientId, deleted: false }),
    ]);
    expect(first.waterGoals).toEqual([{ fromDate: TODAY, goalMl: 2500 }]);
    expect((await t.sync(first.rev)).drinks).toBeUndefined();

    await t.call(t.cookie, 'DELETE', `/drinks/${drink.id}`);
    await t.call(t.cookie, 'DELETE', `/drink-entries/${water.clientId}`);
    await t.call(t.cookie, 'PUT', '/water/goal', { date: TODAY, goalMl: null });
    const next = await t.sync(first.rev);
    expect(next.drinks).toEqual([{ ...drink, deleted: true }]);
    expect(next.drinkEntries).toEqual([
      expect.objectContaining({ clientId: water.clientId, deleted: true }),
    ]);
    expect(next.waterGoals).toEqual([{ fromDate: TODAY, goalMl: null }]);
    expect(next.meals).toEqual([]);
  });

  it('a page can end on drink entries', async () => {
    const t = await setup();
    for (let i = 0; i <= SYNC_PAGE_SIZE; i++)
      await t.call(t.cookie, 'POST', '/drink-entries', entry());
    const p1 = await t.sync(0);
    expect(p1.more).toBe(true);
    expect(p1.drinkEntries).toHaveLength(SYNC_PAGE_SIZE - 1);
    const p2 = await t.sync(p1.rev);
    expect(p2.more).toBe(false);
    expect(p2.drinkEntries).toHaveLength(2);
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
