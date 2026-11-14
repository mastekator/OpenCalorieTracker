import { describe, expect, it } from 'vitest';
import {
  isoWeekId,
  isPeriod,
  monthOf,
  parsePeriodId,
  weekOf,
} from './dates.js';

describe('dates', () => {
  it('takes Monday–Sunday weeks, Sunday included', () => {
    const week = { from: '2026-11-09', to: '2026-11-15' };
    expect(weekOf('2026-11-09')).toEqual(week);
    expect(weekOf('2026-11-15')).toEqual(week);
    expect(isoWeekId('2026-11-15')).toBe('2026-W46');
    expect(parsePeriodId('2026-W46')).toEqual(week);
  });

  it('crosses the year with the ISO week of its Thursday, 53 weeks in 2026', () => {
    expect(weekOf('2027-01-03')).toEqual({
      from: '2026-12-28',
      to: '2027-01-03',
    });
    expect(isoWeekId('2027-01-03')).toBe('2026-W53');
    expect(isoWeekId('2025-12-29')).toBe('2026-W01');
    expect(parsePeriodId('2026-W53')).toEqual({
      from: '2026-12-28',
      to: '2027-01-03',
    });
    expect(parsePeriodId('2026-W01')).toEqual({
      from: '2025-12-29',
      to: '2026-01-04',
    });
    expect(parsePeriodId('2027-W53')).toBeNull();
    expect(parsePeriodId('2026-W00')).toBeNull();
  });

  it('takes calendar months of 28 to 31 days', () => {
    expect(monthOf('2026-11-14')).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(monthOf('2026-12-31')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
    expect(monthOf('2028-02-10').to).toBe('2028-02-29');
    expect(parsePeriodId('2026-02')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(parsePeriodId('2026-13')).toBeNull();
  });

  it('accepts only a whole week or month as a period', () => {
    expect(isPeriod('2026-11-09', '2026-11-15')).toBe(true);
    expect(isPeriod('2026-11-01', '2026-11-30')).toBe(true);
    expect(isPeriod('2026-11-10', '2026-11-16')).toBe(false);
    expect(isPeriod('2026-11-01', '2026-11-29')).toBe(false);
  });
});
