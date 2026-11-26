import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { addDays, type Drink, type DrinkEntry } from '@oct/shared';
import { ensureAdmin } from '../auth/admin.js';
import { hashPassword } from '../auth/password.js';
import { serverToday } from '../profile/routes.js';
import { setCookie, testApp } from '../test/app.js';

const PASSWORD = 'Correct-horse-battery-9';
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

async function setup() {
  const t = testApp();
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
  const cookie = await signIn('admin@example.com');
  const call = (method: string, path: string, body?: unknown, as = cookie) =>
    t.app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie: as },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const log = (fields: Record<string, unknown>, as = cookie) =>
    call(
      'POST',
      '/drink-entries',
      {
        clientId: randomUUID(),
        date: TODAY,
        takenAt: new Date().toISOString(),
        ml: 250,
        ...fields,
      },
      as,
    );
  const addUser = async (email: string) => {
    const { lastInsertRowid } = t.db
      .prepare(
        "INSERT INTO users (email, role, webauthn_user_id, created_at) VALUES (?, 'user', randomblob(16), 0)",
      )
      .run(email);
    t.db
      .prepare(
        'INSERT INTO passwords (user_id, hash, updated_at) VALUES (?, ?, 0)',
      )
      .run(lastInsertRowid, await hashPassword(PASSWORD));
    return { id: Number(lastInsertRowid), cookie: await signIn(email) };
  };
  const syncRev = () =>
    t.db.prepare('SELECT sync_rev FROM users WHERE id = 1').pluck().get();
  return { ...t, call, log, addUser, syncRev };
}

describe('/api/drinks', () => {
  it('creates, edits and deletes an own drink, deletion idempotent', async () => {
    const t = await setup();
    const res = await t.call('POST', '/drinks', LATTE);
    expect(res.status).toBe(201);
    const drink = (await res.json()) as Drink;
    expect(drink).toEqual({ id: drink.id, ...LATTE, deleted: false });

    const edited = await t.call('PATCH', `/drinks/${drink.id}`, {
      ...LATTE,
      name: 'Flat white',
    });
    expect(await edited.json()).toMatchObject({ name: 'Flat white' });

    expect((await t.call('DELETE', `/drinks/${drink.id}`)).status).toBe(204);
    const rev = t.syncRev();
    expect((await t.call('DELETE', `/drinks/${drink.id}`)).status).toBe(204);
    expect(t.syncRev()).toBe(rev);
    expect((await t.call('PATCH', `/drinks/${drink.id}`, LATTE)).status).toBe(
      404,
    );
  });

  it("hides another user's drinks", async () => {
    const t = await setup();
    const other = await t.addUser('other@example.com');
    const { id } = (await (
      await t.call('POST', '/drinks', LATTE, other.cookie)
    ).json()) as Drink;
    expect((await t.call('PATCH', `/drinks/${id}`, LATTE)).status).toBe(404);
    expect((await t.call('DELETE', `/drinks/${id}`)).status).toBe(404);
    expect((await t.log({ drinkKey: `custom:${id}` })).status).toBe(404);
  });
});

describe('/api/drink-entries', () => {
  it('snapshots a built-in drink without a name; a replay returns the same entry', async () => {
    const t = await setup();
    const body = {
      clientId: randomUUID(),
      date: TODAY,
      takenAt: '2026-01-01T08:00:00.000Z',
      ml: 200,
      drinkKey: 'milk',
    };
    const res = await t.call('POST', '/drink-entries', body);
    expect(res.status).toBe(201);
    const entry = (await res.json()) as DrinkEntry;
    expect(entry).toEqual({
      clientId: body.clientId,
      date: TODAY,
      takenAt: body.takenAt,
      drinkKey: 'milk',
      illustration: 'dairy',
      ml: 200,
      countsWater: true,
      kcal: 104,
      proteinG: 5.6,
      fatG: 5,
      carbsG: 9.4,
      deleted: false,
    });
    const rev = t.syncRev();
    const again = await t.call('POST', '/drink-entries', { ...body, ml: 500 });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(entry);
    expect(t.syncRev()).toBe(rev);
  });

  it('keeps the snapshot after the own drink is edited or deleted', async () => {
    const t = await setup();
    const { id } = (await (
      await t.call('POST', '/drinks', LATTE)
    ).json()) as Drink;
    const entry = (await (
      await t.log({ drinkKey: `custom:${id}`, ml: 300 })
    ).json()) as DrinkEntry;
    expect(entry).toMatchObject({
      name: 'Latte',
      kcal: 150,
      countsWater: false,
    });
    await t.call('PATCH', `/drinks/${id}`, { ...LATTE, name: 'X', kcal: 0 });
    await t.call('DELETE', `/drinks/${id}`);
    const stored = await t.call('POST', '/drink-entries', {
      clientId: entry.clientId,
      date: TODAY,
      takenAt: entry.takenAt,
      ml: 300,
      drinkKey: `custom:${id}`,
    });
    expect(await stored.json()).toEqual(entry);
    // A new entry of the deleted drink is refused; the client drops it.
    expect((await t.log({ drinkKey: `custom:${id}` })).status).toBe(404);
  });

  it('stores a photo snapshot as sent', async () => {
    const t = await setup();
    const photo = {
      name: 'Smoothie',
      illustration: 'drinks',
      kcal: 120,
      proteinG: 2,
      fatG: 1,
      carbsG: 25,
      countsWater: true,
    };
    expect(await (await t.log({ photo })).json()).toMatchObject({
      ...photo,
      drinkKey: null,
    });
  });

  it('accepts tomorrow, refuses the day after', async () => {
    const t = await setup();
    expect(
      (await t.log({ drinkKey: 'water', date: addDays(TODAY, 1) })).status,
    ).toBe(201);
    const res = await t.log({ drinkKey: 'water', date: addDays(TODAY, 2) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: 'validation_failed' },
    });
  });

  it("deletes idempotently and hides another user's entries", async () => {
    const t = await setup();
    const other = await t.addUser('other@example.com');
    const { clientId } = (await (
      await t.log({ drinkKey: 'water' })
    ).json()) as DrinkEntry;
    expect(
      (
        await t.call(
          'DELETE',
          `/drink-entries/${clientId}`,
          undefined,
          other.cookie,
        )
      ).status,
    ).toBe(404);
    expect((await t.call('DELETE', `/drink-entries/${clientId}`)).status).toBe(
      204,
    );
    const rev = t.syncRev();
    expect((await t.call('DELETE', `/drink-entries/${clientId}`)).status).toBe(
      204,
    );
    expect(t.syncRev()).toBe(rev);
    expect(
      t.db
        .prepare('SELECT deleted FROM drink_entries WHERE client_id = ?')
        .pluck()
        .get(clientId),
    ).toBe(1);
  });
});

describe('PUT /api/water/goal', () => {
  it('replaces the row of the day; null resets to the reference', async () => {
    const t = await setup();
    const put = (date: string, goalMl: number | null) =>
      t.call('PUT', '/water/goal', { date, goalMl });
    expect((await put(TODAY, 2500)).status).toBe(204);
    expect((await put(TODAY, null)).status).toBe(204);
    expect((await put(addDays(TODAY, -3), 1800)).status).toBe(204);
    expect((await put(TODAY, 100)).status).toBe(400);
    expect(
      t.db
        .prepare(
          'SELECT from_date, goal_ml FROM water_goals ORDER BY from_date',
        )
        .all(),
    ).toEqual([
      { from_date: addDays(TODAY, -3), goal_ml: 1800 },
      { from_date: TODAY, goal_ml: null },
    ]);
  });
});

it("deletes the user's drinks, entries and goals with the user", async () => {
  const t = await setup();
  const other = await t.addUser('other@example.com');
  await t.call('POST', '/drinks', LATTE, other.cookie);
  await t.log({ drinkKey: 'water' }, other.cookie);
  await t.call(
    'PUT',
    '/water/goal',
    { date: TODAY, goalMl: 2000 },
    other.cookie,
  );
  await t.log({ drinkKey: 'water' });
  t.db.prepare('DELETE FROM users WHERE id = ?').run(other.id);
  const count = (table: string) =>
    t.db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get();
  expect([
    count('drinks'),
    count('drink_entries'),
    count('water_goals'),
  ]).toEqual([0, 1, 0]);
});
