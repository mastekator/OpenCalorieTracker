import { describe, expect, it } from 'vitest';
import { sumDay } from '../diary/summarize.js';
import {
  BUILTIN_DRINKS,
  drinkEntryInputSchema,
  drinkInputSchema,
  drinkRowOrder,
  entryFrom,
  waterGoalOn,
  waterGoalSchema,
  waterOfDay,
  type DrinkEntryLike,
} from './drinks.js';

const builtin = (key: string) => BUILTIN_DRINKS.find((d) => d.key === key)!;

const entry = (
  drinkKey: string,
  over: Partial<DrinkEntryLike> = {},
): DrinkEntryLike => ({
  drinkKey,
  date: '2026-11-26',
  ml: 250,
  countsWater: true,
  kcal: 0,
  proteinG: 0,
  fatG: 0,
  carbsG: 0,
  ...over,
});

describe('BUILTIN_DRINKS', () => {
  it('has the eight drinks of AC-3.1, water first, zero-kcal water, tea and coffee', () => {
    expect(BUILTIN_DRINKS.map((d) => d.key)).toEqual([
      'water',
      'tea',
      'coffee',
      'coffee_milk',
      'juice',
      'milk',
      'soda',
      'kefir',
    ]);
    for (const k of ['water', 'tea', 'coffee'])
      expect(Object.values(builtin(k).per100)).toEqual([0, 0, 0, 0]);
  });
});

describe('entryFrom', () => {
  it('snapshots ml × per 100 ml / 100, rounded to 0.1', () => {
    expect(entryFrom(builtin('milk'), 333)).toEqual({
      illustration: 'dairy',
      ml: 333,
      countsWater: true,
      kcal: 173.2,
      proteinG: 9.3,
      fatG: 8.3,
      carbsG: 15.7,
    });
  });

  it('keeps the name and countsWater of an own drink', () => {
    const own = {
      name: 'Beer',
      illustration: 'drinks-wine' as const,
      per100: { kcal: 43, proteinG: 0.5, fatG: 0, carbsG: 3.6 },
      countsWater: false,
    };
    expect(entryFrom(own, 500)).toMatchObject({
      name: 'Beer',
      countsWater: false,
      kcal: 215,
    });
  });

  it('gives zeros for water', () => {
    expect(entryFrom(builtin('water'), 250)).toMatchObject({
      kcal: 0,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
    });
  });
});

describe('waterOfDay', () => {
  it('sums live entries that count as water', () => {
    expect(
      waterOfDay([
        entry('water'),
        entry('coffee', { ml: 100 }),
        entry('custom:1', { ml: 500, countsWater: false }),
        entry('water', { ml: 400, deleted: true }),
      ]),
    ).toBe(350);
    expect(waterOfDay([])).toBe(0);
  });
});

describe('waterGoalOn', () => {
  const goals = [
    { fromDate: '2026-11-10', goalMl: 2500 },
    { fromDate: '2026-11-20', goalMl: null },
    { fromDate: '2026-11-25', goalMl: 3000 },
  ];

  it('takes the latest row on or before the day', () => {
    expect(waterGoalOn(goals, '2026-11-10', 'male')).toBe(2500);
    expect(waterGoalOn(goals, '2026-11-15', 'male')).toBe(2500);
    expect(waterGoalOn(goals, '2026-11-26', 'male')).toBe(3000);
  });

  it('falls back to the reference by sex before any row or on a reset', () => {
    expect(waterGoalOn(goals, '2026-11-01', 'female')).toBe(1600);
    expect(waterGoalOn(goals, '2026-11-22', 'female')).toBe(1600);
    expect(waterGoalOn(goals, '2026-11-22', 'male')).toBe(2000);
    expect(waterGoalOn([], '2026-11-22', null)).toBe(2000);
  });
});

describe('drinkRowOrder', () => {
  const today = '2026-11-26';

  it('puts water first, then by use in the last 30 days, ties in the built-in order', () => {
    expect(
      drinkRowOrder({
        entries: [
          entry('kefir'),
          entry('kefir', { date: '2026-10-28' }), // today-29: counts
          entry('milk'),
          entry('custom:2'),
          entry('custom:2'),
          entry('custom:2', { date: '2026-10-27' }), // today-30: too old
          entry('custom:2', { deleted: true }),
          entry('soda', { date: '2026-11-27' }), // future: not counted
        ],
        customDrinks: [{ id: 2 }, { id: 1 }],
        hidden: [],
        today,
      }),
    ).toEqual([
      'water',
      'kefir',
      'custom:2',
      'milk',
      'tea',
      'coffee',
      'coffee_milk',
      'juice',
      'soda',
      'custom:1',
    ]);
  });

  it('leaves out hidden built-ins and deleted own drinks, never water', () => {
    expect(
      drinkRowOrder({
        entries: [entry('tea'), entry('custom:3')],
        customDrinks: [{ id: 3, deleted: true }],
        hidden: ['water', 'tea', 'coffee', 'juice', 'milk', 'soda', 'kefir'],
        today,
      }),
    ).toEqual(['water', 'coffee_milk']);
  });
});

describe('sumDay with drinks', () => {
  const meal = { kcal: 500, proteinG: 20, fatG: 10, carbsG: 60 };

  it('adds drink entries to the day; without drinks nothing changes', () => {
    const latte = entryFrom(builtin('coffee_milk'), 250);
    expect(sumDay([meal])).toEqual(meal);
    expect(sumDay([meal, latte, entryFrom(builtin('water'), 500)])).toEqual({
      kcal: 575,
      proteinG: 23.8,
      fatG: 13.3,
      carbsG: 66,
    });
  });
});

describe('schemas', () => {
  const base = {
    clientId: '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e',
    date: '2026-11-26',
    takenAt: '2026-11-26T09:00:00+03:00',
  };

  it('accepts 10–2000 whole ml and a built-in or own key', () => {
    for (const ml of [10, 2000])
      expect(
        drinkEntryInputSchema.safeParse({ ...base, ml, drinkKey: 'tea' })
          .success,
      ).toBe(true);
    expect(
      drinkEntryInputSchema.safeParse({
        ...base,
        ml: 250,
        drinkKey: 'custom:7',
      }).success,
    ).toBe(true);
    for (const ml of [9, 2001, 250.5])
      expect(
        drinkEntryInputSchema.safeParse({ ...base, ml, drinkKey: 'tea' })
          .success,
      ).toBe(false);
    for (const drinkKey of ['wine', 'custom:0', 'custom:x'])
      expect(
        drinkEntryInputSchema.safeParse({ ...base, ml: 250, drinkKey }).success,
      ).toBe(false);
  });

  it('takes a photo snapshot instead of a key, never both or neither', () => {
    const photo = {
      name: 'Orange juice',
      illustration: 'drinks',
      kcal: 112,
      proteinG: 1.7,
      fatG: 0.5,
      carbsG: 26,
      countsWater: true,
    };
    expect(
      drinkEntryInputSchema.safeParse({ ...base, ml: 250, photo }).success,
    ).toBe(true);
    expect(
      drinkEntryInputSchema.safeParse({
        ...base,
        ml: 250,
        photo,
        drinkKey: 'juice',
      }).success,
    ).toBe(false);
    expect(drinkEntryInputSchema.safeParse({ ...base, ml: 250 }).success).toBe(
      false,
    );
  });

  it('checks the own drink and the water goal ranges', () => {
    const drink = {
      name: '  My latte  ',
      illustration: 'coffee',
      kcal: 1000,
      proteinG: 0,
      fatG: 100,
      carbsG: 0,
      countsWater: true,
    };
    expect(drinkInputSchema.parse(drink).name).toBe('My latte');
    expect(drinkInputSchema.safeParse({ ...drink, name: ' ' }).success).toBe(
      false,
    );
    expect(
      drinkInputSchema.safeParse({ ...drink, name: 'x'.repeat(41) }).success,
    ).toBe(false);
    expect(drinkInputSchema.safeParse({ ...drink, kcal: 1001 }).success).toBe(
      false,
    );
    expect(drinkInputSchema.safeParse({ ...drink, fatG: -1 }).success).toBe(
      false,
    );
    for (const v of [500, 6000, null])
      expect(waterGoalSchema.safeParse(v).success).toBe(true);
    for (const v of [499, 6001, 1500.5])
      expect(waterGoalSchema.safeParse(v).success).toBe(false);
  });
});
