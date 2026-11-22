import { describe, expect, it } from 'vitest';
import {
  axisStart,
  nearest,
  periodStart,
  weightAxis,
  xTicks,
} from './weightScale';

describe('periodStart', () => {
  it('goes back calendar months', () => {
    expect(periodStart('2026-11-16', 'month')).toBe('2026-10-16');
    expect(periodStart('2026-11-16', 'quarter')).toBe('2026-08-16');
    expect(periodStart('2026-11-16', 'year')).toBe('2025-11-16');
    expect(periodStart('2026-02-10', 'quarter')).toBe('2025-11-10');
  });
  it('clamps the day to a shorter month', () => {
    expect(periodStart('2026-05-31', 'quarter')).toBe('2026-02-28');
    expect(periodStart('2028-03-31', 'month')).toBe('2028-02-29');
    expect(periodStart('2026-07-31', 'month')).toBe('2026-06-30');
  });
  it('has no start for all', () => {
    expect(periodStart('2026-11-16', 'all')).toBeNull();
  });
});

describe('weightAxis', () => {
  it('uses 0.5 for a narrow spread', () => {
    const a = weightAxis([80.2, 80.6, 81.1]);
    expect(a.step).toBe(0.5);
    expect(a.lo).toBeLessThanOrEqual(80.2);
    expect(a.hi).toBeGreaterThanOrEqual(81.1);
  });
  it('widens to fit the goal and keeps 3–5 lines', () => {
    const a = weightAxis([80.2, 81.4, 73]);
    expect(a.step).toBe(5);
    expect(a.lo).toBeLessThanOrEqual(73);
    expect(a.ticks.length).toBeGreaterThanOrEqual(3);
    expect(a.ticks.length).toBeLessThanOrEqual(5);
    for (const values of [
      [80],
      [70, 72],
      [0.1, 4.1],
      [60, 95],
      [50, 140],
      [30, 300],
      [66, 660],
      [80.05, 81.95],
    ]) {
      const n = weightAxis(values).ticks.length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
  it('one value gets at least two steps', () => {
    const a = weightAxis([80]);
    expect(a.hi - a.lo).toBeGreaterThanOrEqual(2 * a.step);
    expect(a.ticks).toEqual([79.5, 80, 80.5]);
  });
});

describe('nearest', () => {
  it('finds the closest value, ties to the left', () => {
    const xs = [0, 3, 10, 11];
    expect(nearest(xs, -5)).toBe(0);
    expect(nearest(xs, 1)).toBe(0);
    expect(nearest(xs, 1.5)).toBe(0);
    expect(nearest(xs, 2)).toBe(1);
    expect(nearest(xs, 10.6)).toBe(3);
    expect(nearest(xs, 99)).toBe(3);
    expect(nearest([], 1)).toBe(-1);
  });
});

describe('axisStart', () => {
  const today = '2026-11-22';
  it('starts a short history at its first weighing with some air', () => {
    // 19 days back from today: 8% is 1.52, rounded up to 2 days.
    expect(axisStart('2026-11-03', '2026-08-22', today)).toBe('2026-11-01');
  });
  it('keeps the period start for a long history', () => {
    expect(axisStart('2026-08-23', '2026-08-22', today)).toBe('2026-08-22');
    expect(axisStart('2025-01-01', '2026-10-22', today)).toBe('2026-10-22');
  });
  it('gives one weighing at least 5 calendar days', () => {
    expect(axisStart(today, '2026-08-22', today)).toBe('2026-11-18');
    expect(axisStart('2026-11-20', null, today)).toBe('2026-11-18');
  });
  it('pads «all» the same way', () => {
    // 100 days: 8 days of air.
    expect(axisStart('2026-08-14', null, today)).toBe('2026-08-06');
  });
});

describe('xTicks', () => {
  const today = '2026-11-22';
  const dates = (start: string) => xTicks(start, today).map((t) => t.date);
  it('steps days back from today, at most 5 labels', () => {
    expect(dates('2026-11-18')).toEqual([
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
    expect(dates('2026-11-14')).toEqual([
      '2026-11-14',
      '2026-11-16',
      '2026-11-18',
      '2026-11-20',
      '2026-11-22',
    ]);
    expect(dates('2026-11-10')).toEqual([
      '2026-11-10',
      '2026-11-13',
      '2026-11-16',
      '2026-11-19',
      '2026-11-22',
    ]);
    expect(dates('2026-10-23')).toEqual([
      '2026-10-25',
      '2026-11-01',
      '2026-11-08',
      '2026-11-15',
      '2026-11-22',
    ]);
    expect(dates('2026-10-08').length).toBe(4);
    expect(dates('2026-10-08').at(-1)).toBe(today);
  });
  it('names the month on the first label and where it changes', () => {
    expect(xTicks('2026-10-23', today).map((t) => t.kind)).toEqual([
      'day_month',
      'day_month',
      'day',
      'day',
      'day',
    ]);
  });
  it('labels month starts up to 400 days, the latest kept', () => {
    expect(dates('2026-08-22')).toEqual([
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
    ]);
    // 13 month starts: every 3rd back from November.
    expect(dates('2025-10-20')).toEqual([
      '2025-11-01',
      '2026-02-01',
      '2026-05-01',
      '2026-08-01',
      '2026-11-01',
    ]);
    expect(xTicks('2025-10-20', today)[1]!.kind).toBe('month');
  });
  it('reads January as its year', () => {
    expect(xTicks('2025-12-15', '2026-03-10')[0]).toEqual({
      date: '2026-01-01',
      kind: 'year',
    });
  });
  it('labels years past 400 days', () => {
    expect(xTicks('2024-03-01', today)).toEqual([
      { date: '2025-01-01', kind: 'year' },
      { date: '2026-01-01', kind: 'year' },
    ]);
    expect(dates('2016-06-01')).toEqual([
      '2018-01-01',
      '2020-01-01',
      '2022-01-01',
      '2024-01-01',
      '2026-01-01',
    ]);
  });
  it('takes the longest step for a very long history', () => {
    // 40 years: even every 5th leaves 8 labels.
    const d = dates('1986-06-01');
    expect(d.length).toBe(8);
    expect(d.at(-1)).toBe('2026-01-01');
    expect(d[0]).toBe('1991-01-01');
  });
});
