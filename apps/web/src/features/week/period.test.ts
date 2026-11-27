import { describe, expect, it } from 'vitest';
import type { DrinkEntry, Meal } from '@oct/shared';
import {
  periodDays,
  periodLabel,
  periodOfId,
  periodPath,
  stepPeriod,
} from './period';

const t = (key: 'week.this' | 'week.last') =>
  key === 'week.this' ? 'This week' : 'Last week';
const TODAY = '2026-11-12';

describe('period', () => {
  it('steps weeks and months, across a year', () => {
    expect(stepPeriod('week', '2026-11-12', -1)).toBe('2026-11-02');
    expect(stepPeriod('week', '2026-11-12', 1)).toBe('2026-11-16');
    expect(stepPeriod('month', '2026-03-31', -1)).toBe('2026-02-01');
    expect(stepPeriod('month', '2026-12-05', 1)).toBe('2027-01-01');
  });

  it('builds the address of the period', () => {
    expect(periodPath('week', TODAY)).toBe('/week/2026-W46');
    expect(periodPath('month', TODAY)).toBe('/month/2026-11');
  });

  it('accepts only a real, not future period of the right kind', () => {
    expect(periodOfId('week', '2026-W46', TODAY)).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(periodOfId('month', '2026-11', TODAY)?.to).toBe('2026-11-30');
    expect(periodOfId('week', '2026-W47', TODAY)).toBeNull();
    expect(periodOfId('month', '2026-12', TODAY)).toBeNull();
    expect(periodOfId('week', '2026-W54', TODAY)).toBeNull();
    expect(periodOfId('week', '2026-11', TODAY)).toBeNull();
    expect(periodOfId('month', 'oops', TODAY)).toBeNull();
  });

  it('labels this, last and older weeks and a month', () => {
    const label = (mode: 'week' | 'month', date: string) =>
      periodLabel(mode, date, TODAY, 'en', t);
    expect(label('week', TODAY).label).toBe('This week');
    expect(label('week', '2026-11-03').label).toBe('Last week');
    const older = label('week', '2026-10-28');
    // Intl puts thin spaces around the dash.
    expect(older.label).toMatch(/^Oct 26\s–\sNov 1$/);
    expect(older.sub).toBeNull();
    expect(label('week', '2025-12-17').sub).toBe('2025');
    expect(label('month', TODAY)).toEqual({ label: 'November', sub: '2026' });
    expect(periodLabel('month', TODAY, TODAY, 'ru', t).label).toBe('Ноябрь');
  });

  it('adds drink kcal to the days, not to the meal count', () => {
    const meal = {
      localDate: '2026-11-12',
      kcal: 500,
      proteinG: 20,
      fatG: 10,
      carbsG: 60,
    } as Meal;
    const drink = {
      date: '2026-11-12',
      kcal: 100,
      proteinG: 1,
      fatG: 0,
      carbsG: 20,
    } as DrinkEntry;
    const [day, next] = periodDays([meal], '2026-11-12', '2026-11-13', [
      drink,
      { ...drink, date: '2026-11-13' },
    ]);
    expect(day).toMatchObject({ kcal: 600, carbsG: 80, meals: 1 });
    expect(next).toMatchObject({ kcal: 100, meals: 0 });
  });
});
