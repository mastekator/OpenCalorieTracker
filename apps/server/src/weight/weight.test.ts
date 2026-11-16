import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addDays, type Profile, type ProfileResponse } from '@oct/shared';
import { ensureAdmin } from '../auth/admin.js';
import { hashPassword } from '../auth/password.js';
import { migrate } from '../db/migrate.js';
import { openDb } from '../db/open.js';
import { serverToday } from '../profile/routes.js';
import { setCookie, testApp } from '../test/app.js';

const PASSWORD = 'Correct-horse-battery-9';
const TODAY = serverToday();
const EMPTY: Profile = {
  sex: null,
  birthDate: null,
  heightCm: null,
  weightKg: null,
  activity: null,
  goal: null,
  targetWeightKg: null,
  deadline: null,
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
  const weigh = (date: string, weightKg: number, as = cookie) =>
    call('PUT', `/weighings/${date}`, { weightKg }, as);
  const unweigh = (date: string, as = cookie) =>
    call('DELETE', `/weighings/${date}`, undefined, as);
  const profile = async (as = cookie) =>
    (await (
      await call('GET', '/profile', undefined, as)
    ).json()) as ProfileResponse;
  const rows = () =>
    t.db
      .prepare('SELECT user_id, date, weight_kg FROM weighings ORDER BY date')
      .all();
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
  return { ...t, call, weigh, unweigh, profile, rows, addUser };
}

describe('PUT/DELETE /api/weighings/:date', () => {
  it('replaces a repeat weighing of the day and returns the profile', async () => {
    const t = await setup();
    expect((await t.weigh(TODAY, 80)).status).toBe(200);
    const res = await t.weigh(TODAY, 79.5);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      weighing: { date: TODAY, weightKg: 79.5 },
      profile: await t.profile(),
    });
    expect(body.profile.profile.weightKg).toBe(79.5);
    expect(t.rows()).toHaveLength(1);
  });

  it('leaves the profile alone for a back-dated weighing', async () => {
    const t = await setup();
    await t.weigh(TODAY, 80);
    const { rev } = await t.profile();
    await t.weigh(addDays(TODAY, -3), 85);
    expect(await t.profile()).toMatchObject({
      profile: { weightKg: 80 },
      rev,
    });
  });

  it('moves the profile when the latest weighing is edited or deleted', async () => {
    const t = await setup();
    await t.weigh(addDays(TODAY, -1), 81);
    await t.weigh(TODAY, 80);
    await t.weigh(TODAY, 79);
    expect((await t.profile()).profile.weightKg).toBe(79);

    const res = await t.unweigh(TODAY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profile: await t.profile() });
    expect((await t.profile()).profile.weightKg).toBe(81);
    // Kept as a NULL row so the deletion syncs.
    expect(t.rows()).toContainEqual(
      expect.objectContaining({ date: TODAY, weight_kg: null }),
    );
  });

  it('keeps the profile weight when the last weighing is deleted (E-9.7)', async () => {
    const t = await setup();
    await t.weigh(TODAY, 80);
    await t.unweigh(TODAY);
    const after = await t.profile();
    expect(after.profile.weightKg).toBe(80);
    // Idempotent: a second delete changes nothing, not even the rev.
    const sync = () =>
      t.db.prepare('SELECT sync_rev FROM users WHERE id = 1').pluck().get();
    const before = sync();
    expect((await t.unweigh(TODAY)).status).toBe(200);
    expect((await t.unweigh(addDays(TODAY, -9))).status).toBe(200);
    expect(sync()).toBe(before);
    expect(await t.profile()).toEqual(after);
  });

  it('rejects a future date, a date before birth and a weight out of range', async () => {
    const t = await setup();
    // Today + 1 is allowed for devices ahead of the server.
    expect((await t.weigh(addDays(TODAY, 1), 80)).status).toBe(200);
    const future = await t.weigh(addDays(TODAY, 2), 80);
    expect(future.status).toBe(400);
    expect(await future.json()).toEqual({
      error: {
        code: 'validation_failed',
        details: [{ path: ['date'], code: 'weighing_date_in_future' }],
      },
    });

    await t.call('PUT', '/profile', {
      profile: { ...EMPTY, birthDate: '1990-05-10' },
      manual: null,
    });
    const early = await t.weigh('1990-05-09', 80);
    expect(early.status).toBe(400);
    expect((await early.json()).error.details).toEqual([
      { path: ['date'], code: 'weighing_date_before_birth' },
    ]);
    expect((await t.weigh('1990-05-10', 80)).status).toBe(200);

    for (const kg of [29.9, 300.1])
      expect((await t.weigh(TODAY, kg)).status).toBe(400);
    expect((await t.weigh('2026-02-30', 80)).status).toBe(400);
    expect((await t.unweigh('soon')).status).toBe(400);
  });

  it('needs a session', async () => {
    const t = await setup();
    expect((await t.weigh(TODAY, 80, '')).status).toBe(401);
    expect((await t.unweigh(TODAY, '')).status).toBe(401);
  });

  it('keeps users apart and deletes weighings with the user', async () => {
    const t = await setup();
    const other = await t.addUser('b@example.com');
    await t.weigh(TODAY, 80);
    await t.weigh(TODAY, 60, other.cookie);
    await t.unweigh(TODAY, other.cookie);
    expect((await t.profile()).profile.weightKg).toBe(80);
    expect(t.rows()).toContainEqual({
      user_id: 1,
      date: TODAY,
      weight_kg: 80,
    });

    t.db.prepare('DELETE FROM users WHERE id = ?').run(other.id);
    expect(t.rows()).toEqual([{ user_id: 1, date: TODAY, weight_kg: 80 }]);
  });
});

describe('PUT /api/profile', () => {
  it("makes a new weight today's weighing (AC-9.10)", async () => {
    const t = await setup();
    const put = (weightKg: number | null) =>
      t.call('PUT', '/profile', {
        profile: { ...EMPTY, weightKg },
        manual: null,
      });
    expect((await put(80)).status).toBe(200);
    expect(t.rows()).toEqual([{ user_id: 1, date: TODAY, weight_kg: 80 }]);
    // An unchanged weight does not touch the diary.
    await t.unweigh(TODAY);
    await put(80);
    expect(t.rows()).toEqual([{ user_id: 1, date: TODAY, weight_kg: null }]);
  });

  it('keeps the profile on the latest weighing whatever the body says', async () => {
    const t = await setup();
    await t.weigh(TODAY, 80);
    const res = await t.call('PUT', '/profile', {
      profile: { ...EMPTY, weightKg: null },
      manual: null,
    });
    expect(((await res.json()) as ProfileResponse).profile.weightKg).toBe(80);
    expect((await t.profile()).profile.weightKg).toBe(80);
  });
});

describe('migration 0009', () => {
  it("moves the profile weight to a weighing on the profile's save date", () => {
    const db = openDb(':memory:');
    const dir = new URL('../db/migrations/', import.meta.url);
    for (const f of readdirSync(dir)
      .filter((f) => /^\d{4}_\w+\.sql$/.test(f))
      .sort()
      .filter((f) => f < '0009'))
      db.exec(readFileSync(new URL(f, dir), 'utf8'));
    db.pragma('user_version = 8');
    for (const id of [1, 2])
      db.prepare(
        "INSERT INTO users (id, email, role, webauthn_user_id, created_at, sync_rev) VALUES (?, ?, 'user', randomblob(16), 0, 5)",
      ).run(id, `${id}@b.c`);
    const savedAt = new Date(2026, 9, 3, 23, 30).getTime();
    db.prepare(
      'INSERT INTO profiles (user_id, weight_kg, updated_at) VALUES (1, 72.5, ?), (2, NULL, ?)',
    ).run(savedAt, savedAt);

    migrate(db);
    expect(db.prepare('SELECT * FROM weighings').all()).toEqual([
      {
        user_id: 1,
        date: '2026-10-03',
        weight_kg: 72.5,
        rev: 6,
        updated_at: savedAt,
      },
    ]);
    expect(
      db.prepare('SELECT sync_rev FROM users ORDER BY id').pluck().all(),
    ).toEqual([6, 5]);
  });
});
