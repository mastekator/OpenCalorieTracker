import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@oct/shared';
import { ensureAdmin } from '../auth/admin.js';
import { hashPassword } from '../auth/password.js';
import { setCookie, testApp } from '../test/app.js';
import { getDailyNorm } from './norm.js';

const PASSWORD = 'Correct-horse-battery-9';
const TODAY = new Date().toLocaleDateString('sv');
const addDays = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
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
const FULL: Profile = {
  sex: 'female',
  birthDate: '1991-01-01',
  heightCm: 165,
  weightKg: 70,
  activity: 'light',
  goal: 'lose',
  targetWeightKg: 60,
  deadline: null,
};
const MANUAL = { kcal: 2000, proteinPct: 20, fatPct: 30, carbsPct: 50 };

async function setup() {
  const t = testApp();
  await ensureAdmin(t.config, t.db);
  const call = (method: string, cookie: string, body?: unknown) =>
    t.app.request('/api/profile', {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const signIn = async (email = 'admin@example.com') => {
    const res = await t.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    return setCookie(res, 'oct_session')!.split(';')[0]!;
  };
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
  };
  const cookie = await signIn();
  const put = (profile: Partial<Profile>, manual: unknown = null) =>
    call('PUT', cookie, { profile: { ...EMPTY, ...profile }, manual });
  return { ...t, call, signIn, addUser, cookie, put };
}

afterEach(() => vi.restoreAllMocks());

describe('GET/PUT /api/profile', () => {
  it('returns an empty profile before the first save', async () => {
    const { call, cookie } = await setup();
    const res = await call('GET', cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profile: EMPTY, manual: null, rev: 0 });
  });

  it('is 401 without a session', async () => {
    const { call } = await setup();
    expect((await call('GET', '')).status).toBe(401);
    expect(
      (await call('PUT', '', { profile: EMPTY, manual: null })).status,
    ).toBe(401);
  });

  it('saves a partial profile and returns weight without rounding (AC-1.3, AC-0.4a)', async () => {
    const { put, call, cookie } = await setup();
    const weightKg = 180 * 0.45359237; // 81.6466266 kg from 180 lb
    const res = await put({ sex: 'male', weightKg });
    expect(res.status).toBe(200);
    const body = {
      profile: { ...EMPTY, sex: 'male', weightKg },
      manual: null,
      rev: 0,
    };
    expect(await res.json()).toEqual(body);
    expect(await (await call('GET', cookie)).json()).toEqual(body);
  });

  it('replaces the whole profile and clears the manual norm with null', async () => {
    const { put, call, cookie, db } = await setup();
    await put(FULL, MANUAL);
    expect((await (await call('GET', cookie)).json()).manual).toEqual(MANUAL);
    await put({ weightKg: 71 });
    expect(await (await call('GET', cookie)).json()).toEqual({
      profile: { ...EMPTY, weightKg: 71 },
      manual: null,
      rev: 0,
    });
    expect(db.prepare('SELECT COUNT(*) FROM profiles').pluck().get()).toBe(1);
  });

  it('rejects an out-of-range field with its path (AC-1.4)', async () => {
    const { put } = await setup();
    const res = await put({ heightCm: 300 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'validation_failed',
        details: [{ path: ['profile', 'heightCm'], code: 'too_big' }],
      },
    });
  });

  it('saves a manual norm without a profile (AC-3.7)', async () => {
    const { put } = await setup();
    const res = await put({}, MANUAL);
    expect(res.status).toBe(200);
    expect((await res.json()).manual).toEqual(MANUAL);
  });

  it('rejects macro shares that do not sum to 100', async () => {
    const { put } = await setup();
    const res = await put({}, { ...MANUAL, carbsPct: 49 });
    expect(res.status).toBe(400);
    expect((await res.json()).error.details[0].path).toEqual(['manual']);
  });

  it('checks a new deadline, also on the first save', async () => {
    const { put } = await setup();
    const res = await put({ ...FULL, deadline: addDays(TODAY, 7) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.details).toEqual([
      { path: ['profile', 'deadline'], code: 'deadline_too_soon' },
    ]);
    expect((await put({ ...FULL, deadline: addDays(TODAY, 60) })).status).toBe(
      200,
    );
  });

  it('a stored overdue deadline does not block saving a new weight (E-1.8)', async () => {
    const { put, db } = await setup();
    await put({ ...FULL, deadline: addDays(TODAY, 60) });
    db.prepare('UPDATE profiles SET deadline = ?').run(addDays(TODAY, -1));
    const res = await put({
      ...FULL,
      weightKg: 69,
      deadline: addDays(TODAY, -1),
    });
    expect(res.status).toBe(200);
  });

  it('a reached goal does not block saving a new weight (E-1.7)', async () => {
    const { put } = await setup();
    expect((await put(FULL)).status).toBe(200);
    expect((await put({ ...FULL, weightKg: 59 })).status).toBe(200);
    const res = await put({ ...FULL, weightKg: 59, targetWeightKg: 58.5 });
    expect(res.status).toBe(200);
    const bad = await put({ ...FULL, weightKg: 59, targetWeightKg: 65 });
    expect((await bad.json()).error.details).toEqual([
      { path: ['profile', 'targetWeightKg'], code: 'target_not_below_weight' },
    ]);
  });

  it('checks a changed birth date', async () => {
    const { put } = await setup();
    const res = await put({ birthDate: addDays(TODAY, 1) });
    expect((await res.json()).error.details).toEqual([
      { path: ['profile', 'birthDate'], code: 'birth_date_in_future' },
    ]);
  });

  it("never exposes another user's profile (AC-0.1)", async () => {
    const { put, call, signIn, addUser } = await setup();
    await put(FULL, MANUAL);
    await addUser('bob@example.com');
    const bob = await signIn('bob@example.com');
    expect(await (await call('GET', bob)).json()).toEqual({
      profile: EMPTY,
      manual: null,
      rev: 0,
    });
  });
});

describe('getDailyNorm', () => {
  it('is null without a profile, calculated when complete, manual when set', async () => {
    const { put, db } = await setup();
    expect(getDailyNorm(db, 1, TODAY)).toBeNull();
    await put({ sex: 'female', weightKg: 70 });
    expect(getDailyNorm(db, 1, TODAY)).toBeNull();
    await put(FULL);
    expect(getDailyNorm(db, 1, TODAY)).toMatchObject({ source: 'calculated' });
    await put(FULL, MANUAL);
    expect(getDailyNorm(db, 1, TODAY)).toEqual({
      source: 'manual',
      kcal: 2000,
      proteinG: 100,
      fatG: 67,
      carbsG: 250,
    });
  });

  it('is null for a minor', async () => {
    const { put, db } = await setup();
    await put({ ...FULL, birthDate: '2015-01-01' });
    expect(getDailyNorm(db, 1, '2026-11-13')).toBeNull();
  });

  it('uses the given today', async () => {
    const { put, db } = await setup();
    await put({
      ...FULL,
      birthDate: '1990-06-15',
      goal: 'maintain',
      targetWeightKg: null,
    });
    const before = getDailyNorm(db, 1, '2030-06-14')!.kcal;
    const after = getDailyNorm(db, 1, '2030-06-15')!.kcal;
    expect(before).toBeGreaterThan(after); // one year older on the birthday (E-1.2)
  });
});
