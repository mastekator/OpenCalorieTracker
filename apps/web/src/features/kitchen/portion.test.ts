import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recipePortion } from '@oct/shared';
import { openUserDb, type Db } from '../../data/db';
import { clearLocal } from '../../data/user';
import { PILAF } from './fixtures';
import { logPortion, portionMeal } from './portion';

let db: Db;
beforeEach(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('offline'))),
  );
  db = await openUserDb(9);
});
afterEach(async () => {
  vi.unstubAllGlobals();
  db.close();
  await clearLocal(9);
});

describe('logPortion', () => {
  it('offline: the meal is saved locally and queued', async () => {
    const item = recipePortion(PILAF, 350);
    const at = new Date(2026, 10, 19, 19, 40);
    await logPortion(db, item, { mealType: 'dinner', at });
    const [op] = await db.getAll('outbox');
    expect(op).toMatchObject({
      kind: 'createMeal',
      body: {
        mealType: 'dinner',
        eatenAt: at.toISOString(),
        localDate: '2026-11-19',
        items: [{ source: 'recipe', recipeId: 1, grams: 350 }],
      },
    });
    expect(await db.count('meals')).toBe(1);
  });

  it('builds a new meal on the local day of `at`', () => {
    const at = new Date(2026, 10, 19, 1, 0);
    const meal = portionMeal(recipePortion(PILAF, 100), 'snack', at);
    expect(meal.localDate).toBe('2026-11-19');
    expect(meal.tzOffsetMin).toBe(-at.getTimezoneOffset());
  });
});
