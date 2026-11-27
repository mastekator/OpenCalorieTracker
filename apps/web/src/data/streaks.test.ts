import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AWARDS, type Meal } from '@oct/shared';
import { openUserDb, type Db } from './db';
import { createMeal, flush } from './outbox';
import { AWARDS_CATALOG, markImportRetro, markSeen, streaks } from './streaks';
import { clearLocal } from './user';

const TODAY = '2026-11-27';

let n = 0;
const meal = (localDate: string, recognized = false) =>
  ({
    clientId: `m${++n}`,
    localDate,
    tzOffsetMin: 0,
    eatenAt: `${localDate}T12:00:00.000Z`,
    recognized,
    items: [{ grams: 100, source: 'manual', proteinG: 0, fatG: 0, carbsG: 0 }],
  }) as unknown as Meal;

let db: Db;
const settle = () => flush(db).catch(() => {});
const keys = async () => (await db.getAll('awards')).map((a) => a.key);

beforeEach(async () => {
  // Offline: every put stays queued.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('offline'))),
  );
  db = await openUserDb(9);
  await db.put('kv', 1, 'rev');
  await db.put('kv', Date.now(), 'fullSyncAt');
  await db.put('meals', meal('2026-11-26'));
});

afterEach(async () => {
  await settle();
  vi.unstubAllGlobals();
  db.close();
  await clearLocal(9);
});

describe('grants', () => {
  it('none before the first full pull', async () => {
    await db.delete('kv', 'fullSyncAt');
    const s = await streaks(db, TODAY);
    expect(s.awards.find((a) => a.key === 'days_1')?.done).toBe(true);
    expect(await keys()).toEqual([]);
    expect(await db.getAll('challengeMonths')).toEqual([]);
  });

  it('the first run is retro, a later award is live and congratulated', async () => {
    let s = await streaks(db, TODAY);
    expect(await keys()).toContain('days_1');
    expect(s.celebrate).toEqual([]);
    expect(await db.get('kv', 'awardsCatalog')).toBe(AWARDS_CATALOG);

    await db.put('meals', meal(TODAY, true));
    await db.put('kv', 2, 'rev');
    s = await streaks(db, TODAY);
    expect(s.celebrate.map((a) => a.key)).toEqual(['photo_1']);

    await markSeen(db, s.celebrate);
    s = await streaks(db, TODAY);
    expect(s.celebrate).toEqual([]);
    expect(await db.get('awards', 'photo_1')).toMatchObject({ seen: true });
  });

  it('a new catalog version is retro', async () => {
    await db.put('kv', AWARDS_CATALOG - 1, 'awardsCatalog');
    const s = await streaks(db, TODAY);
    expect(await keys()).toContain('days_1');
    expect(s.celebrate).toEqual([]);
  });

  it('an import is retro', async () => {
    await streaks(db, TODAY);
    await markImportRetro(db);
    await db.put('meals', meal(TODAY, true));
    await db.put('kv', 2, 'rev');
    const s = await streaks(db, TODAY);
    expect(await keys()).toContain('photo_1');
    expect(s.celebrate).toEqual([]);
  });

  it('switched off: nothing is written; on again: retro', async () => {
    await streaks(db, TODAY);
    await db.put('kv', { streaksEnabled: false } as never, 'settings');
    await db.put('meals', meal(TODAY, true));
    await db.put('kv', 2, 'rev');
    await settle();
    const before = await db.getAll('outbox');
    let s = await streaks(db, TODAY);
    expect(s.on).toBe(false);
    expect(await keys()).not.toContain('photo_1');
    expect(await db.getAll('outbox')).toEqual(before);

    await db.put('kv', { streaksEnabled: true } as never, 'settings');
    s = await streaks(db, TODAY);
    expect(await keys()).toContain('photo_1');
    expect(s.celebrate).toEqual([]);
  });

  it('an offline save moves progress at once', async () => {
    const days = async () =>
      (await streaks(db, TODAY)).awards.find((a) => a.key === 'days_30')!.value;
    expect(await days()).toBe(1);
    await createMeal(db, {
      clientId: '00000000-0000-4000-8000-000000000001',
      eatenAt: `${TODAY}T09:00:00.000Z`,
      tzOffsetMin: 0,
      localDate: TODAY,
      mealType: 'breakfast',
      items: [
        {
          name: 'Oats',
          grams: 50,
          kcal: 190,
          proteinG: 6,
          fatG: 3,
          carbsG: 33,
          source: 'manual',
        },
      ],
    });
    expect(await days()).toBe(2);
  });
});

describe('months', () => {
  it('writes the month on first look, adds done, closes a past month', async () => {
    await db.put('challengeMonths', {
      month: '2026-10',
      keys: ['days_20'],
      done: {},
      closed: false,
    });
    const s = await streaks(db, TODAY);
    const row = await db.get('challengeMonths', '2026-11');
    expect(row?.keys).toEqual(s.challenges.map((c) => c.key));
    expect(row?.keys).toHaveLength(3);
    expect(await db.get('challengeMonths', '2026-10')).toMatchObject({
      closed: true,
    });

    // profile is the only challenge done at once: it is dated today
    await db.put(
      'kv',
      {
        profile: {
          sex: 'f',
          birthDate: '1990-01-01',
          heightCm: 170,
          weightKg: 60,
          activity: 'low',
          goal: 'keep',
        },
      } as never,
      'profile',
    );
    await db.put('challengeMonths', {
      month: '2026-11',
      keys: ['profile', 'days_20'],
      done: {},
      closed: false,
    });
    await streaks(db, TODAY);
    expect((await db.get('challengeMonths', '2026-11'))?.done).toEqual({
      profile: TODAY,
    });
  });

  it('switched off: no month is written', async () => {
    await db.put('kv', { streaksEnabled: false } as never, 'settings');
    await streaks(db, TODAY);
    expect(await db.getAll('challengeMonths')).toEqual([]);
  });
});

it('years of diary compute in reasonable time', async () => {
  const tx = db.transaction('meals', 'readwrite');
  for (let d = 0; d < 5 * 365; d++) {
    const date = new Date(Date.UTC(2021, 10, 27 + d))
      .toISOString()
      .slice(0, 10);
    for (let i = 0; i < 4; i++) void tx.store.put(meal(date, i === 0));
  }
  await tx.done;
  await db.put('kv', 2, 'rev');
  const start = performance.now();
  const s = await streaks(db, TODAY);
  const ms = performance.now() - start;
  console.info(`streaks over 5 years (7300 meals): ${ms.toFixed(0)} ms`);
  expect(s.awards).toHaveLength(AWARDS.length);
  expect(s.streak.best).toBeGreaterThan(200);
});
