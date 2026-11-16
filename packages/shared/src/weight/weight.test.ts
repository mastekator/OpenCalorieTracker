import { describe, expect, it } from 'vitest';
import { profileSchema } from '../norm/schemas.js';
import { unitRanges } from '../units.js';
import { commaFix, jumpCheck } from './jump.js';
import { weighingDateError, weighingSchema } from './schemas.js';
import { trendChange, weightTrend } from './trend.js';

const daily = (...weights: number[]) =>
  weights.map((weightKg, i) => ({ date: `2026-11-0${i + 1}`, weightKg }));

describe('weightTrend', () => {
  it('smooths daily noise around the true weight', () => {
    const trend = weightTrend(daily(80, 81, 80, 79, 80))!;
    expect(trend).toHaveLength(5);
    expect(trend[4]).toBeGreaterThanOrEqual(79.8);
    expect(trend[4]).toBeLessThanOrEqual(80.2);
  });

  it('moves 10 % of a step per day', () => {
    const trend = weightTrend(daily(80, 90, 90))!;
    expect(trend[1]).toBeCloseTo(81);
    expect(trend[2]).toBeCloseTo(81.9);
  });

  it('weights a gap of n days by 1 − 0.9ⁿ', () => {
    const trend = weightTrend([
      { date: '2026-11-01', weightKg: 80 },
      { date: '2026-11-02', weightKg: 80 },
      { date: '2026-11-05', weightKg: 90 },
    ])!;
    expect(trend[2]).toBeCloseTo(80 + (1 - 0.9 ** 3) * 10);
  });

  it('is null below 3 weighings', () => {
    expect(weightTrend([])).toBeNull();
    expect(weightTrend(daily(80))).toBeNull();
    expect(weightTrend(daily(80, 81))).toBeNull();
  });
});

describe('trendChange', () => {
  const points = daily(80, 81, 80, 79, 80);
  const trend = weightTrend(points)!;

  it('starts from the last weighing on or before the period start', () => {
    expect(trendChange(points, '2026-11-03')).toBeCloseTo(
      trend[4]! - trend[2]!,
    );
  });

  it('starts from the first weighing when history begins inside the period', () => {
    expect(trendChange(points, '2026-10-01')).toBeCloseTo(trend[4]! - 80);
  });

  it('is null without a trend', () => {
    expect(trendChange(daily(80, 81), '2026-10-01')).toBeNull();
  });
});

describe('jumpCheck', () => {
  const nearest = { date: '2026-11-01', weightKg: 80 };

  it('is quiet up to exactly 5 %', () => {
    expect(jumpCheck(84, nearest)).toBeNull();
    expect(jumpCheck(76, nearest)).toBeNull();
  });

  it('returns the signed difference above 5 %', () => {
    expect(jumpCheck(84.1, nearest)).toBeCloseTo(4.1);
    expect(jumpCheck(75.9, nearest)).toBeCloseTo(-4.1);
  });

  it('is null without a neighbour', () => {
    expect(jumpCheck(120, null)).toBeNull();
  });
});

describe('commaFix', () => {
  const kg = unitRanges('metric').weight;

  it('moves a misplaced separator', () => {
    expect(commaFix('8,02', kg)).toBe(80.2);
    expect(commaFix('802', kg)).toBe(80.2);
    expect(commaFix('8.5', kg)).toBe(85);
  });

  it('works in lb', () => {
    expect(commaFix('1,805', unitRanges('us').weight)).toBe(180.5);
  });

  it('is null for input in range, not a number, or two possible fixes', () => {
    expect(commaFix('80.2', kg)).toBeNull();
    expect(commaFix('abc', kg)).toBeNull();
    expect(commaFix('', kg)).toBeNull();
    expect(commaFix('3,00', kg)).toBeNull();
    expect(commaFix('99999', kg)).toBeNull();
  });
});

describe('weighingSchema', () => {
  it('accepts 30–300 kg', () => {
    const ok = (weightKg: number) =>
      weighingSchema.safeParse({ date: '2026-11-01', weightKg }).success;
    expect([29.9, 30, 300, 300.1].map(ok)).toEqual([false, true, true, false]);
  });

  it('shares the bounds with the profile', () => {
    const profile = {
      sex: null,
      birthDate: null,
      heightCm: null,
      activity: null,
      goal: null,
      targetWeightKg: null,
      deadline: null,
    };
    expect(
      profileSchema.safeParse({ ...profile, weightKg: 300.1 }).success,
    ).toBe(false);
    expect(profileSchema.safeParse({ ...profile, weightKg: 300 }).success).toBe(
      true,
    );
  });
});

describe('weighingDateError', () => {
  it('rejects the future and dates before birth', () => {
    expect(weighingDateError('2026-11-17', '2026-11-16', null)).toBe(
      'weighing_date_in_future',
    );
    expect(weighingDateError('1990-01-01', '2026-11-16', '1990-01-02')).toBe(
      'weighing_date_before_birth',
    );
    expect(
      weighingDateError('1990-01-02', '2026-11-16', '1990-01-02'),
    ).toBeNull();
    expect(weighingDateError('2026-11-16', '2026-11-16', null)).toBeNull();
  });
});
