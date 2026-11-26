import { describe, expect, it } from 'vitest';
import { addDays } from '../dates.js';
import {
  dayFacts,
  streakState,
  streaksOn,
  type StreakMeal,
} from './streaks.js';

const MON = '2026-01-05';

/** Logs the first `n` days of each week from MON; today is the last day of the last week. */
const run = (
  perWeek: number[],
  today = addDays(MON, perWeek.length * 7 - 1),
) => {
  const days = perWeek.flatMap((n, w) =>
    Array.from({ length: n }, (_, d) => ({
      date: addDays(MON, w * 7 + d),
      meals: 1,
    })),
  );
  return streakState(days, { today, firstDay: MON });
};
const statuses = (perWeek: number[], today?: string) =>
  run(perWeek, today).weeks.map((w) => w.status);

describe('streakState', () => {
  it('counts weeks with 5 of 7 days and keeps the best after a restart', () => {
    // gift freeze saves week 3, week 5 has none left
    const s = run([5, 7, 4, 5, 0, 0, 6, 5]);
    expect(s.weeks.map((w) => w.status)).toEqual([
      'counted',
      'counted',
      'frozen',
      'counted',
      'short',
      'short',
      'counted',
      'counted',
    ]);
    expect(s).toMatchObject({
      current: 2,
      best: 3,
      freezes: 0,
      weeksToFreeze: 2,
    });
  });

  it('gives a freeze per 4 counted weeks, up to 2; frozen weeks do not break the run', () => {
    expect(run([5, 5, 5])).toMatchObject({ freezes: 1, weeksToFreeze: 1 });
    expect(run([5, 5, 5, 5])).toMatchObject({
      freezes: 2,
      weeksToFreeze: null,
    });
    expect(run([5, 5, 5, 5, 5, 5, 5, 5, 5])).toMatchObject({
      current: 9,
      freezes: 2,
    });
    // spend one at the cap, then 4 fresh counted weeks earn it back
    expect(statuses([5, 5, 5, 5, 0, 5, 5, 5])).toContain('frozen');
    expect(run([5, 5, 5, 5, 0, 5, 5, 5])).toMatchObject({
      current: 7,
      freezes: 1,
    });
    expect(run([5, 5, 5, 5, 0, 5, 5, 5, 5])).toMatchObject({ freezes: 2 });
    // 2 counted, frozen, 2 counted: 4 counted in a row
    expect(run([5, 5, 0, 5, 5])).toMatchObject({
      current: 4,
      freezes: 1,
      weeksToFreeze: 4,
    });
  });

  it('does not spend the gift before the first counted week (E-2.1)', () => {
    const s = run([2, 0, 5]);
    expect(s.weeks.map((w) => w.status)).toEqual(['short', 'short', 'counted']);
    expect(s).toMatchObject({ current: 1, freezes: 1 });
  });

  it('gives the freeze back when a missing day is logged later (E-2.2)', () => {
    expect(run([5, 4, 5])).toMatchObject({ current: 2, freezes: 0 });
    expect(run([5, 5, 5])).toMatchObject({ current: 3, freezes: 1 });
  });

  it('keeps the current week open until it counts (AC-1.4)', () => {
    const thu = addDays(MON, 7 + 3);
    const open = run([5, 3], thu);
    expect(open.weeks.at(-1)!.status).toBe('current');
    expect(open).toMatchObject({
      current: 1,
      week: { days: 3, target: 5, counted: false },
    });
    const done = run([5, 5], thu);
    expect(done.weeks.at(-1)!.status).toBe('counted');
    expect(done).toMatchObject({
      current: 2,
      week: { days: 5, counted: true },
    });
  });

  it('trails the last 10 weeks', () => {
    const s = run(Array(12).fill(5));
    expect(s.weeks).toHaveLength(12);
    expect(s.trail).toEqual(s.weeks.slice(2));
    expect(run([5]).trail).toHaveLength(1);
  });

  it.each([
    ['Mon', 0, 5],
    ['Tue', 1, 5],
    ['Thu', 3, 4],
    ['Sun', 6, 1],
  ])(
    'first week starting %s needs min(5, days left) (E-1.1)',
    (_, offset, target) => {
      const firstDay = addDays(MON, offset);
      const today = addDays(MON, 6);
      const days = (n: number) =>
        Array.from({ length: n }, (_, i) => ({
          date: addDays(firstDay, i),
          meals: 1,
        }));
      expect(streakState(days(target), { today, firstDay })).toMatchObject({
        current: 1,
        week: { target, counted: true },
      });
      expect(
        streakState(days(target - 1), { today, firstDay }).week.counted,
      ).toBe(false);
    },
  );

  it('starts empty with the gift freeze', () => {
    expect(streakState([], { today: MON, firstDay: null })).toMatchObject({
      current: 0,
      best: 0,
      freezes: 1,
      weeksToFreeze: 4,
      weeks: [],
    });
  });
});

const meal = (date: string, kcal: number, extra: Partial<StreakMeal> = {}) => ({
  localDate: date,
  tzOffsetMin: 180,
  kcal,
  items: [
    {
      grams: 100,
      source: 'manual' as const,
      kcal,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
    },
  ],
  ...extra,
});

describe('dayFacts', () => {
  it('folds meals per day', () => {
    const facts = dayFacts([
      meal('2026-01-06', 300, { loggedAt: '2026-01-07T22:00:00Z' }),
      meal('2026-01-05', 500, {
        recognized: true,
        loggedAt: '2026-01-05T21:30:00Z', // 00:30 on Jan 6 at +03:00
        items: [
          {
            grams: 120,
            aiGrams: 100,
            source: 'ai',
            proteinG: 1,
            fatG: 1,
            carbsG: 1,
          },
          {
            grams: 100,
            aiGrams: 100,
            source: 'ai',
            proteinG: 1,
            fatG: 1,
            carbsG: 1,
          },
          { grams: 50, source: 'manual', proteinG: 0, fatG: 2, carbsG: 0 },
          { grams: 50, source: 'history', proteinG: 3, fatG: 0, carbsG: 0 },
        ],
      }),
      meal('2026-01-06', 200, { loggedAt: '2026-01-06T10:00:00Z' }),
    ]);
    expect(facts).toEqual([
      {
        date: '2026-01-05',
        meals: 1,
        photoMeals: 1,
        preciseDishes: 1,
        ownDishes: 1,
        loggedDate: '2026-01-06',
      },
      {
        date: '2026-01-06',
        meals: 2,
        photoMeals: 0,
        preciseDishes: 0,
        ownDishes: 0,
        loggedDate: '2026-01-06',
      },
    ]);
    expect(dayFacts([meal('2026-01-05', 1)])[0]!.loggedDate).toBeNull();
  });

  it('does not read kcal', () => {
    const diary = (kcal: number) =>
      Array.from({ length: 30 }, (_, i) =>
        meal(addDays(MON, i % 9 ? i : i + 1), kcal * (i + 1)),
      );
    const state = (kcal: number) => {
      const days = dayFacts(diary(kcal));
      return {
        days,
        streak: streakState(days, { today: addDays(MON, 34), firstDay: MON }),
      };
    };
    expect(state(100)).toEqual(state(3000));
  });
});

describe('streaksOn', () => {
  const today = '2026-06-15';
  it('follows the explicit choice', () => {
    expect(
      streaksOn({ streaksEnabled: true }, { birthDate: '2015-01-01' }, today),
    ).toBe(true);
    expect(
      streaksOn({ streaksEnabled: false }, { birthDate: null }, today),
    ).toBe(false);
  });

  it('defaults to off under 18 and on otherwise', () => {
    expect(streaksOn({}, { birthDate: '2008-06-16' }, today)).toBe(false);
    expect(
      streaksOn({ streaksEnabled: null }, { birthDate: '2008-06-15' }, today),
    ).toBe(true);
    expect(streaksOn({}, { birthDate: null }, today)).toBe(true);
    expect(streaksOn({}, null, today)).toBe(true);
  });

  it('turns 18 on March 1 for a February 29 birthday in a common year', () => {
    expect(streaksOn({}, { birthDate: '2008-02-29' }, '2026-02-28')).toBe(
      false,
    );
    expect(streaksOn({}, { birthDate: '2008-02-29' }, '2026-03-01')).toBe(true);
  });
});
