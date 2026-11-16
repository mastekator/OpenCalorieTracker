import { describe, expect, it } from 'vitest';
import { nearest, periodStart, weightAxis } from './weightScale';

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
