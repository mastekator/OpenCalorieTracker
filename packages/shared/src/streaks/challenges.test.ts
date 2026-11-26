import { describe, expect, it } from 'vitest';
import { addDays } from '../dates.js';
import {
  CHALLENGE_KEYS,
  challengeProgress,
  monthChallenges,
  type ChallengeKey,
} from './challenges.js';
import { dayFacts, type DayFact, type StreakMeal } from './streaks.js';

const fact = (date: string, o: Partial<DayFact> = {}): DayFact => ({
  date,
  meals: 1,
  photoMeals: 0,
  preciseDishes: 0,
  ownDishes: 0,
  loggedDate: null,
  ...o,
});
const range = (from: string, n: number, o: Partial<DayFact> = {}) =>
  Array.from({ length: n }, (_, i) => fact(addDays(from, i), o));

const ALL = { photoAi: true, profileDone: false };
const months = Array.from(
  { length: 24 },
  (_, i) =>
    `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
);
const one = (
  key: ChallengeKey,
  days: DayFact[],
  month = '2026-03',
  profileDone = false,
) => challengeProgress(month, [key], days, { profileDone })[0]!;

describe('monthChallenges', () => {
  it('gives the same 3 distinct keys for the same month', () => {
    for (const m of months) {
      const set = monthChallenges(m, ALL);
      expect(set).toEqual(monthChallenges(m, ALL));
      expect(new Set(set).size).toBe(3);
    }
    expect(
      new Set(months.map((m) => monthChallenges(m, ALL).join())).size,
    ).toBeGreaterThan(1);
  });

  it('skips photo and grams without photo AI and profile once done', () => {
    for (const m of months) {
      const set = monthChallenges(m, { photoAi: false, profileDone: true });
      expect([...set].sort()).toEqual([
        'days_20',
        'full_week',
        'manual_macros_5',
      ]);
      const noAi = monthChallenges(m, { photoAi: false, profileDone: false });
      expect(noAi).toHaveLength(3);
      expect(noAi).not.toContain('photo_20');
      expect(noAi).not.toContain('grams_10');
      expect(
        monthChallenges(m, { photoAi: true, profileDone: true }),
      ).not.toContain('profile');
    }
  });

  it('keeps the list order from the hashed start', () => {
    const set = monthChallenges('2026-03', ALL);
    const start = CHALLENGE_KEYS.indexOf(set[0]!);
    expect(set).toEqual([0, 1, 2].map((i) => CHALLENGE_KEYS[(start + i) % 6]));
  });
});

describe('challengeProgress', () => {
  it('days_20: logged days of the month, done on the 20th', () => {
    const days = [
      ...range('2026-02-20', 9),
      ...range('2026-03-01', 25, { meals: 2 }),
    ];
    days[12] = fact('2026-03-04', { meals: 0 });
    expect(one('days_20', days)).toEqual({
      key: 'days_20',
      value: 24,
      target: 20,
      done: true,
      doneOn: '2026-03-21',
    });
    expect(one('days_20', range('2026-02-01', 28))).toMatchObject({
      value: 0,
      done: false,
      doneOn: null,
    });
  });

  it('full_week: only Monday–Sunday weeks wholly inside the month', () => {
    // March 2026 starts on Sunday: weeks Mar 2–8 … Mar 23–29 count, Mar 30–31 do not
    expect(one('full_week', range('2026-02-23', 7))).toMatchObject({
      value: 0,
      done: false,
    });
    expect(one('full_week', range('2026-03-26', 6))).toMatchObject({
      value: 4,
      done: false,
    });
    expect(one('full_week', range('2026-03-09', 7))).toEqual({
      key: 'full_week',
      value: 7,
      target: 7,
      done: true,
      doneOn: '2026-03-15',
    });
  });

  it('photo, grams and own dishes sum the day facts', () => {
    const days = range('2026-03-01', 10, {
      photoMeals: 2,
      preciseDishes: 1,
      ownDishes: 1,
    });
    expect(one('photo_20', days)).toMatchObject({
      value: 20,
      done: true,
      doneOn: '2026-03-10',
    });
    expect(one('grams_10', days)).toMatchObject({
      value: 10,
      done: true,
      doneOn: '2026-03-10',
    });
    expect(one('manual_macros_5', days)).toMatchObject({
      value: 10,
      done: true,
      doneOn: '2026-03-05',
    });
    expect(
      one('photo_20', range('2026-04-01', 30, { photoMeals: 1 })),
    ).toMatchObject({ value: 0 });
  });

  it('profile comes from the context, undated', () => {
    expect(one('profile', [], '2026-03', true)).toMatchObject({
      value: 1,
      done: true,
      doneOn: null,
    });
    expect(one('profile', [], '2026-03', false)).toMatchObject({
      value: 0,
      done: false,
    });
  });

  it('does not read kcal: diaries with other kcal give the same progress', () => {
    const item = {
      grams: 100,
      aiGrams: 90,
      source: 'ai' as const,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
    };
    const diary = (kcal: number) =>
      range('2026-03-01', 20).map((d): StreakMeal => {
        // a full diary item carries kcal; the streak math must ignore it
        const full = { ...item, kcal };
        return {
          localDate: d.date,
          tzOffsetMin: 0,
          recognized: true,
          items: [full],
        };
      });
    const run = (kcal: number) =>
      challengeProgress('2026-03', CHALLENGE_KEYS, dayFacts(diary(kcal)), {
        profileDone: false,
      });
    expect(run(100)).toEqual(run(5000));
    expect(
      run(100)
        .filter((p) => p.done)
        .map((p) => p.key),
    ).toEqual(['days_20', 'full_week', 'photo_20', 'grams_10']);
  });
});
