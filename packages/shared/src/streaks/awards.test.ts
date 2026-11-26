import { describe, expect, it } from 'vitest';
import { addDays } from '../dates.js';
import {
  AWARDS,
  awardProgress,
  grantAwards,
  type ChallengeMonth,
} from './awards.js';
import { dayFacts, streakState, type DayFact } from './streaks.js';

const MON = '2026-01-05';

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
/** Mon–Fri of each week from MON, `weeks` times (0 = an empty week). */
const weekdays = (perWeek: number[]) =>
  perWeek.flatMap((n, w) => range(addDays(MON, w * 7), n));

const progress = (
  days: DayFact[],
  {
    today = days.at(-1)?.date ?? MON,
    months = [] as ChallengeMonth[],
    birthDate = null as string | null,
  } = {},
) => {
  const streak = streakState(days, { today, firstDay: days[0]?.date ?? null });
  const list = awardProgress(days, streak, months, { birthDate });
  return Object.fromEntries(list.map((p) => [p.key, p]));
};
const on = (
  days: DayFact[],
  key: string,
  opts?: Parameters<typeof progress>[1],
) => progress(days, opts)[key]!.achievedOn ?? null;

const count = (by: (a: (typeof AWARDS)[number]) => string) =>
  AWARDS.reduce<Record<string, number>>(
    (acc, a) => ({ ...acc, [by(a)]: (acc[by(a)] ?? 0) + 1 }),
    {},
  );

describe('AWARDS', () => {
  it('has 32 unique keys split as in the product table', () => {
    expect(new Set(AWARDS.map((a) => a.key)).size).toBe(32);
    expect(count((a) => a.category)).toEqual({
      path: 6,
      streak: 5,
      days: 5,
      months: 4,
      photo: 3,
      accuracy: 3,
      secret: 6,
    });
    expect(count((a) => a.rarity)).toEqual({
      common: 11,
      rare: 9,
      epic: 9,
      legendary: 3,
    });
  });
});

describe('awardProgress', () => {
  it('returns every award in catalog order', () => {
    expect(progress([]).weeks_1).toEqual({
      key: 'weeks_1',
      done: false,
      value: 0,
      target: 1,
    });
    expect(Object.keys(progress([]))).toEqual(AWARDS.map((a) => a.key));
  });

  it.each([1, 4, 12, 26, 52, 104])(
    'weeks_%i: counted weeks, not in a row',
    (n) => {
      const fridayOf = (w: number) => addDays(MON, w * 7 + 4);
      // a short week in the middle breaks the streak but not the journey
      const gap = Array.from({ length: n + 3 }, (_, w) => (w === 1 ? 0 : 5));
      expect(on(weekdays(gap), `weeks_${n}`)).toBe(fridayOf(n === 1 ? 0 : n));
      // the first week counts on the day it gets its 5th day
      expect(on(weekdays(Array(n).fill(5)), `weeks_${n}`)).toBe(
        fridayOf(n - 1),
      );
      expect(on(weekdays(Array(n - 1).fill(5)), `weeks_${n}`)).toBeNull();
    },
  );

  it.each([2, 8, 16, 26, 52])('streak_%i: best streak first reaches n', (n) => {
    expect(on(weekdays(Array(n).fill(5)), `streak_${n}`)).toBe(
      addDays(MON, (n - 1) * 7 + 4),
    );
    // three empty weeks outlast the 2 freezes and restart it
    const broken = [...Array(n - 1).fill(5), 0, 0, 0, 5];
    expect(
      progress(weekdays(broken), { today: addDays(MON, (n + 2) * 7 - 1) })[
        `streak_${n}`
      ],
    ).toMatchObject({ done: false, value: n - 1 });
  });

  it('streak: a frozen week keeps the run without adding to it', () => {
    const p = progress(weekdays([5, 0, 5]));
    expect(p.streak_2!.achievedOn).toBe(addDays(MON, 18));
    expect(p.weeks_1!.achievedOn).toBe(addDays(MON, 4));
  });

  it.each([1, 30, 100, 365, 1000])('days_%i: logged days', (n) => {
    // empty days count nothing
    const days = [fact(addDays(MON, -1), { meals: 0 }), ...range(MON, n)];
    expect(on(days, `days_${n}`)).toBe(addDays(MON, n - 1));
    if (n > 1) expect(on(range(MON, n - 1), `days_${n}`)).toBeNull();
  });

  it.each([
    ['photo_1', 1, 'photoMeals'],
    ['photo_100', 100, 'photoMeals'],
    ['photo_500', 500, 'photoMeals'],
    ['grams_25', 25, 'preciseDishes'],
    ['grams_250', 250, 'preciseDishes'],
    ['manual_25', 25, 'ownDishes'],
  ] as const)('%s: %i of %s', (key, n, field) => {
    const per3 = range(MON, Math.ceil(n / 3), { [field]: 3 });
    expect(on(per3, key)).toBe(addDays(MON, Math.ceil(n / 3) - 1));
    expect(progress(range(MON, n - 1, { [field]: 1 }))[key]).toMatchObject({
      done: false,
      value: n - 1,
    });
  });

  const month = (
    m: string,
    done: Record<string, string>,
    closed = true,
  ): ChallengeMonth => ({ month: m, keys: ['a', 'b', 'c'], done, closed });
  const perfect = (m: string) =>
    month(m, { a: `${m}-03`, b: `${m}-20`, c: `${m}-11` });

  it('challenge_1: any done challenge, open month too', () => {
    const months = [
      month('2026-04', { b: '2026-04-12' }, false),
      month('2026-03', { a: '2026-03-20' }),
    ];
    expect(on([], 'challenge_1', { months })).toBe('2026-03-20');
    expect(
      on([], 'challenge_1', { months: [month('2026-03', {})] }),
    ).toBeNull();
  });

  it('month_3of3: 3 of 3 in a closed month, done on the last one', () => {
    expect(on([], 'month_3of3', { months: [perfect('2026-03')] })).toBe(
      '2026-03-20',
    );
    expect(
      on([], 'month_3of3', {
        months: [{ ...perfect('2026-03'), closed: false }],
      }),
    ).toBeNull();
    expect(
      on([], 'month_3of3', {
        months: [month('2026-03', { a: '2026-03-01', b: '2026-03-02' })],
      }),
    ).toBeNull();
  });

  it('month_3of3_x6: six closed perfect months, not in a row', () => {
    const six = [
      '2026-01',
      '2026-03',
      '2026-04',
      '2026-06',
      '2026-08',
      '2026-09',
    ];
    const months = [...six.map(perfect), month('2026-02', { a: '2026-02-02' })];
    expect(on([], 'month_3of3_x6', { months })).toBe('2026-09-20');
    expect(
      progress([], { months: months.slice(1) }).month_3of3_x6,
    ).toMatchObject({ done: false, value: 5 });
  });

  it('month_full: every day of a calendar month', () => {
    expect(on(range('2026-01-20', 40), 'month_full')).toBe('2026-02-28');
    expect(on(range('2026-02-02', 58), 'month_full')).toBe('2026-03-31');
    expect(on(range('2026-02-02', 27), 'month_full')).toBeNull();
  });

  it('secret_comeback: a logged day after at least 28 empty days', () => {
    const after = (gap: number) => [fact(MON), fact(addDays(MON, gap + 1))];
    expect(on(after(28), 'secret_comeback')).toBe(addDays(MON, 29));
    expect(on(after(27), 'secret_comeback')).toBeNull();
    // the very first entry is not a comeback
    expect(on([fact(MON)], 'secret_comeback')).toBeNull();
  });

  it('secret_birthday: a logged day on the birthday from the profile', () => {
    const days = [fact('2026-03-14'), fact('2026-03-15')];
    expect(on(days, 'secret_birthday', { birthDate: '1990-03-15' })).toBe(
      '2026-03-15',
    );
    expect(on(days, 'secret_birthday')).toBeNull();
    // February 29 counts on February 28 in a common year
    const leap = '2000-02-29';
    expect(
      on([fact('2027-02-28')], 'secret_birthday', { birthDate: leap }),
    ).toBe('2027-02-28');
    expect(
      on([fact('2028-02-28')], 'secret_birthday', { birthDate: leap }),
    ).toBeNull();
    expect(
      on([fact('2028-02-29')], 'secret_birthday', { birthDate: leap }),
    ).toBe('2028-02-29');
  });

  it('secret_new_year: a logged day on January 1', () => {
    expect(
      on([fact('2026-12-31'), fact('2027-01-01')], 'secret_new_year'),
    ).toBe('2027-01-01');
    expect(on([fact('2027-01-02')], 'secret_new_year')).toBeNull();
  });

  it('secret_freeze: the first freeze spent, on the Monday after the week', () => {
    expect(on(weekdays([5, 0, 5]), 'secret_freeze')).toBe(addDays(MON, 14));
    expect(on(weekdays([5, 5]), 'secret_freeze')).toBeNull();
  });

  it('secret_backfill: a day logged later made a past week count', () => {
    const week = (lateFriday: string | null) =>
      range(MON, 5).map((d, i) => ({
        ...d,
        loggedDate: i === 4 ? lateFriday : d.date,
      }));
    const nextWed = addDays(MON, 9);
    expect(on(week(nextWed), 'secret_backfill', { today: nextWed })).toBe(
      nextWed,
    );
    expect(
      on(week(addDays(MON, 4)), 'secret_backfill', { today: nextWed }),
    ).toBeNull();
    // unknown save time counts as on time
    expect(on(week(null), 'secret_backfill', { today: nextWed })).toBeNull();
    // a sixth day on time leaves 5 on time: nothing was missed
    expect(
      on([...week(nextWed), fact(addDays(MON, 5))], 'secret_backfill', {
        today: nextWed,
      }),
    ).toBeNull();
  });

  it('secret_days_100_row: 100 logged days without a gap', () => {
    expect(on(range(MON, 100), 'secret_days_100_row')).toBe(addDays(MON, 99));
    const split = [...range(MON, 99), ...range(addDays(MON, 100), 99)];
    expect(progress(split).secret_days_100_row).toMatchObject({
      done: false,
      value: 99,
    });
  });

  it('does not read kcal or the norm', () => {
    const meal = (date: string, kcal: number) => ({
      localDate: date,
      tzOffsetMin: 0,
      kcal,
      norm: kcal * 2,
      recognized: true,
      items: [
        {
          grams: 120,
          aiGrams: 100,
          source: 'ai' as const,
          kcal,
          proteinG: 0,
          fatG: 0,
          carbsG: 0,
        },
      ],
    });
    const run = (kcal: number) => {
      const days = dayFacts(
        Array.from({ length: 60 }, (_, i) =>
          meal(addDays(MON, i % 7 === 6 ? i - 1 : i), kcal * (i + 1)),
        ),
      );
      return progress(days, { birthDate: '1990-01-06' });
    };
    expect(run(100)).toEqual(run(4000));
  });
});

describe('grantAwards', () => {
  const p = progress(weekdays([5, 5]));
  const list = Object.values(p);

  it('sends every done award not stored yet, unseen', () => {
    const { awards, celebrate } = grantAwards(
      list,
      [{ key: 'days_1' }],
      'live',
    );
    expect(awards).toEqual([
      { key: 'weeks_1', earnedOn: addDays(MON, 4), seen: false },
      { key: 'streak_2', earnedOn: addDays(MON, 11), seen: false },
    ]);
    expect(celebrate).toBe(true);
  });

  it('retro grants without a celebration', () => {
    expect(grantAwards(list, [], 'retro')).toMatchObject({
      awards: [{ key: 'weeks_1' }, { key: 'streak_2' }, { key: 'days_1' }],
      celebrate: false,
    });
  });

  it('never takes back an award whose entries were deleted', () => {
    const stored = [{ key: 'weeks_1' }, { key: 'streak_2' }, { key: 'days_1' }];
    expect(grantAwards(Object.values(progress([])), stored, 'live')).toEqual({
      awards: [],
      celebrate: false,
    });
    expect(grantAwards(list, stored, 'live').awards).toEqual([]);
  });
});
