import { describe, expect, it } from 'vitest';
import type {
  AccountSettings,
  ChallengeMonth,
  StoredAward,
  SyncResponse,
} from '@oct/shared';
import { ensureAdmin } from '../auth/admin.js';
import { hashPassword } from '../auth/password.js';
import { setCookie, testApp } from '../test/app.js';

const PASSWORD = 'Correct-horse-battery-9';

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
  const putAwards = async (awards: unknown[], as = cookie) => {
    const res = await call('PUT', '/awards', { awards }, as);
    expect(res.status).toBe(200);
    return ((await res.json()) as { awards: StoredAward[] }).awards;
  };
  const putMonth = async (month: string, body: unknown, as = cookie) => {
    const res = await call('PUT', `/challenges/${month}`, body, as);
    expect(res.status).toBe(200);
    return (await res.json()) as ChallengeMonth;
  };
  const sync = async (since: number, as = cookie) =>
    (await (
      await call('GET', `/sync?since=${since}`, undefined, as)
    ).json()) as SyncResponse;
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
  return { ...t, call, putAwards, putMonth, sync, addUser, syncRev };
}

describe('PUT /api/awards', () => {
  it('keeps the earlier day and a seen flag, never deletes, a replay moves no rev', async () => {
    const t = await setup();
    expect(
      await t.putAwards([{ key: 'weeks_1', earnedOn: '2026-11-10' }]),
    ).toEqual([{ key: 'weeks_1', earnedOn: '2026-11-10', seen: false }]);
    expect(
      await t.putAwards([
        { key: 'weeks_1', earnedOn: '2026-11-20', seen: true },
        { key: 'weeks_4', earnedOn: '2026-11-21' },
      ]),
    ).toEqual([
      { key: 'weeks_1', earnedOn: '2026-11-10', seen: true },
      { key: 'weeks_4', earnedOn: '2026-11-21', seen: false },
    ]);
    // An earlier day wins; seen does not go back.
    expect(
      await t.putAwards([
        { key: 'weeks_1', earnedOn: '2026-11-01', seen: false },
      ]),
    ).toEqual([{ key: 'weeks_1', earnedOn: '2026-11-01', seen: true }]);

    const rev = t.syncRev();
    await t.putAwards([{ key: 'weeks_1', earnedOn: '2026-11-05' }]);
    expect(t.syncRev()).toBe(rev);
    expect(t.db.prepare('SELECT COUNT(*) FROM awards').pluck().get()).toBe(2);
  });

  it('refuses an unknown key, a bad day and more than 50', async () => {
    const t = await setup();
    const status = async (awards: unknown[]) =>
      (await t.call('PUT', '/awards', { awards })).status;
    expect(await status([{ key: 'nope', earnedOn: '2026-11-10' }])).toBe(400);
    expect(await status([{ key: 'weeks_1', earnedOn: '2026-13-10' }])).toBe(
      400,
    );
    expect(await status([])).toBe(400);
    expect(
      await status(
        Array.from({ length: 51 }, () => ({
          key: 'weeks_1',
          earnedOn: '2026-11-10',
        })),
      ),
    ).toBe(400);
  });
});

describe('PUT /api/challenges/:month', () => {
  it('keeps the first keys, merges done by the earlier day, never reopens', async () => {
    const t = await setup();
    const first = await t.putMonth('2026-11', {
      keys: ['days_20', 'photo_20', 'profile'],
      done: { profile: '2026-11-03' },
      closed: false,
    });
    expect(first).toEqual({
      month: '2026-11',
      keys: ['days_20', 'photo_20', 'profile'],
      done: { profile: '2026-11-03' },
      closed: false,
    });
    // Another device chose another set: the stored one wins, its foreign done key is dropped.
    expect(
      await t.putMonth('2026-11', {
        keys: ['days_20', 'full_week', 'grams_10'],
        done: {
          days_20: '2026-11-25',
          full_week: '2026-11-08',
          profile: '2026-11-09',
        },
        closed: true,
      }),
    ).toEqual({
      month: '2026-11',
      keys: ['days_20', 'photo_20', 'profile'],
      done: { profile: '2026-11-03', days_20: '2026-11-25' },
      closed: true,
    });

    const rev = t.syncRev();
    expect(
      await t.putMonth('2026-11', {
        keys: ['days_20'],
        done: { days_20: '2026-11-28' },
        closed: false,
      }),
    ).toMatchObject({ done: { days_20: '2026-11-25' }, closed: true });
    expect(t.syncRev()).toBe(rev);
  });

  it('refuses a bad month and keys outside the set', async () => {
    const t = await setup();
    const body = { keys: ['days_20'], done: {}, closed: false };
    expect((await t.call('PUT', '/challenges/2026-13', body)).status).toBe(400);
    expect((await t.call('PUT', '/challenges/2026-1', body)).status).toBe(400);
    for (const keys of [['nope'], ['days_20', 'days_20'], []])
      expect(
        (await t.call('PUT', '/challenges/2026-11', { ...body, keys })).status,
      ).toBe(400);
    expect(
      (
        await t.call('PUT', '/challenges/2026-11', {
          ...body,
          done: { nope: '2026-11-01' },
        })
      ).status,
    ).toBe(400);
  });
});

describe('facts in sync and settings', () => {
  it('syncs awards and months by rev, only to their owner', async () => {
    const t = await setup();
    const other = await t.addUser('other@example.com');
    const start = (await t.sync(0)).rev;
    await t.putAwards([{ key: 'weeks_1', earnedOn: '2026-11-10' }]);
    await t.putMonth('2026-11', {
      keys: ['days_20'],
      done: {},
      closed: false,
    });
    const res = await t.sync(start);
    expect(res.awards).toEqual([
      { key: 'weeks_1', earnedOn: '2026-11-10', seen: false },
    ]);
    expect(res.challengeMonths).toEqual([
      { month: '2026-11', keys: ['days_20'], done: {}, closed: false },
    ]);
    const after = await t.sync(res.rev);
    expect([after.awards, after.challengeMonths]).toEqual([
      undefined,
      undefined,
    ]);

    const theirs = await t.sync(0, other.cookie);
    expect([theirs.awards, theirs.challengeMonths]).toEqual([
      undefined,
      undefined,
    ]);
    // The other user's month starts from their own set, not this one.
    expect(
      (
        await t.putMonth(
          '2026-11',
          { keys: ['profile'], done: {}, closed: false },
          other.cookie,
        )
      ).keys,
    ).toEqual(['profile']);
  });

  it('stores streaksEnabled as true, false or null', async () => {
    const t = await setup();
    const patch = async (streaksEnabled: boolean | null) =>
      (
        (await (
          await t.call('PATCH', '/account/settings', { streaksEnabled })
        ).json()) as AccountSettings
      ).streaksEnabled;
    expect((await t.sync(0)).settings?.streaksEnabled).toBeNull();
    expect(await patch(false)).toBe(false);
    expect(await patch(true)).toBe(true);
    expect(await patch(null)).toBeNull();
  });

  it('deletes the facts with the user and leaves them out of the export', async () => {
    const t = await setup();
    const other = await t.addUser('other@example.com');
    await t.putAwards(
      [{ key: 'weeks_1', earnedOn: '2026-11-10' }],
      other.cookie,
    );
    await t.putMonth(
      '2026-11',
      { keys: ['days_20'], done: {}, closed: false },
      other.cookie,
    );
    await t.putAwards([{ key: 'weeks_1', earnedOn: '2026-11-10' }]);
    const exported = await t.call('GET', '/export?format=json');
    expect(exported.status).toBe(200);
    expect(await exported.text()).not.toContain('weeks_1');

    t.db.prepare('DELETE FROM users WHERE id = ?').run(other.id);
    const count = (table: string) =>
      t.db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get();
    expect([count('awards'), count('challenge_months')]).toEqual([1, 0]);
  });
});
