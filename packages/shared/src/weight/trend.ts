import { daysBetween } from '../dates.js';
import type { Weighing } from './schemas.js';

/** EMA weight per day: a weighing pulls the trend 10 % of the way to it. */
const DAILY_ALPHA = 0.1;

/**
 * Trend value at each weighing (points sorted by date ascending): the first is the weight, then
 * `t += (1 − 0.9ⁿ)(w − t)` with n days since the previous weighing, so gaps count as missed days.
 * Null below 3 points: the trend shows from the third weighing (AC-9.22).
 */
export const weightTrend = (points: readonly Weighing[]): number[] | null => {
  if (points.length < 3) return null;
  const trend = [points[0]!.weightKg];
  for (let i = 1; i < points.length; i++) {
    const t = trend[i - 1]!;
    const n = daysBetween(points[i - 1]!.date, points[i]!.date);
    trend.push(t + (1 - (1 - DAILY_ALPHA) ** n) * (points[i]!.weightKg - t));
  }
  return trend;
};

/**
 * Change "over the period by trend" (AC-9.23): last trend value minus the trend at the last
 * weighing on or before `from`, or at the first weighing when the history starts later.
 * Computed over the whole history so the start of the period does not jump (ADR-0016 §6).
 */
export const trendChange = (points: readonly Weighing[], from: string) => {
  const trend = weightTrend(points);
  if (!trend) return null;
  const before = points.findLastIndex((p) => p.date <= from);
  return trend[trend.length - 1]! - trend[Math.max(before, 0)]!;
};
