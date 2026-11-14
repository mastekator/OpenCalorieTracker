import { describe, expect, it } from 'vitest';
import { addDays } from '../dates.js';
import type { Meal } from '../meals.js';
import { remainingOf, sumDay, summarize, type DayTotals } from './summarize.js';

const NORM = { kcal: 2000, proteinG: 100, fatG: 70, carbsG: 250 };
const ZERO = { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 };

/** Every day of `from..to`; `eaten` maps a date to that day's totals. */
const period = (
  from: string,
  to: string,
  eaten: Record<string, Partial<DayTotals>> = {},
): DayTotals[] => {
  const days: DayTotals[] = [];
  for (let d = from; d <= to; d = addDays(d, 1))
    days.push({ date: d, ...ZERO, meals: 0, ...eaten[d] });
  return days;
};

describe('sumDay and remainingOf', () => {
  it('sums meals unrounded and counts the remainder as norm − eaten', () => {
    const meal = (kcal: number, fatG: number) =>
      ({ kcal, proteinG: 10.05, fatG, carbsG: 20 }) as Meal;
    const total = sumDay([meal(412.3, 9.9), meal(2, 0.1)]);
    expect(total.kcal).toBeCloseTo(414.3, 10);
    expect(total.proteinG).toBeCloseTo(20.1, 10);
    expect(remainingOf(NORM, total).kcal).toBeCloseTo(1585.7, 10);
    expect(sumDay([])).toEqual(ZERO);
  });

  it('gives exactly 0 at the norm, not an overrun (E-1.1)', () => {
    expect(remainingOf(NORM, NORM)).toEqual(ZERO);
  });

  it('shows a fat overrun while kcal still remain (AC-1.5)', () => {
    const r = remainingOf(NORM, {
      kcal: 1500,
      proteinG: 60,
      fatG: 85,
      carbsG: 120,
    });
    expect(r.kcal).toBe(500);
    expect(r.fatG).toBe(-15);
  });
});

describe('summarize', () => {
  it('sets the budget to norm × days for months of 30 and 31 days', () => {
    expect(
      summarize(period('2026-11-01', '2026-11-30'), NORM, '2026-11-14').budget
        ?.kcal,
    ).toBe(60_000);
    expect(
      summarize(period('2026-12-01', '2026-12-31'), NORM, '2026-12-01').budget
        ?.kcal,
    ).toBe(62_000);
  });

  it('averages macros over the days with meals only (AC-3.4)', () => {
    const s = summarize(
      period('2026-11-09', '2026-11-15', {
        '2026-11-09': {
          kcal: 1800,
          proteinG: 90,
          fatG: 60,
          carbsG: 200,
          meals: 3,
        },
        '2026-11-11': {
          kcal: 2200,
          proteinG: 110,
          fatG: 80,
          carbsG: 260,
          meals: 2,
        },
      }),
      NORM,
      '2026-11-12',
    );
    expect(s.daysWithMeals).toBe(2);
    expect(s.average).toEqual({
      kcal: 2000,
      proteinG: 100,
      fatG: 70,
      carbsG: 230,
    });
    expect(s.eaten.kcal).toBe(4000);
    expect(s.remaining?.kcal).toBe(10_000);
    // Thursday to Sunday, today included: 4 days.
    expect(s.perRemainingDay).toBe(2500);
  });

  it('gives ≤ 0 per remaining day once the budget is spent (E-3.6)', () => {
    const s = summarize(
      period('2026-11-09', '2026-11-15', {
        '2026-11-09': { kcal: 14_500, meals: 9 },
      }),
      NORM,
      '2026-11-15',
    );
    expect(s.remaining?.kcal).toBe(-500);
    expect(s.perRemainingDay).toBe(-500);
    expect(
      summarize(
        period('2026-11-09', '2026-11-15', {
          '2026-11-10': { kcal: 14_000, meals: 1 },
        }),
        NORM,
        '2026-11-13',
      ).perRemainingDay,
    ).toBe(0);
  });

  it('has no per-day figure when today is outside the period', () => {
    expect(
      summarize(period('2026-11-02', '2026-11-08'), NORM, '2026-11-14')
        .perRemainingDay,
    ).toBeNull();
  });

  it('has no budget or remainder without a norm (AC-1.10, E-3.1)', () => {
    const s = summarize(
      period('2026-11-09', '2026-11-15', {
        '2026-11-09': { kcal: 500, meals: 1 },
      }),
      null,
      '2026-11-12',
    );
    expect(s).toMatchObject({
      budget: null,
      remaining: null,
      perRemainingDay: null,
      daysWithMeals: 1,
    });
    expect(s.eaten.kcal).toBe(500);
    expect(s.average?.kcal).toBe(500);
  });

  it('has no averages over a period without meals', () => {
    expect(
      summarize(period('2026-11-09', '2026-11-15'), NORM, '2026-11-12'),
    ).toMatchObject({ average: null, daysWithMeals: 0 });
  });
});
