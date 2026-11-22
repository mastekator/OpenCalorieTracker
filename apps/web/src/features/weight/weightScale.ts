import { addDays, daysBetween } from '@oct/shared';

/** Chart periods of the weight screen; «all» has no start. */
export const PERIODS = ['month', 'quarter', 'year', 'all'] as const;
export type WeightPeriod = (typeof PERIODS)[number];

const MONTHS: Record<WeightPeriod, number | null> = {
  month: 1,
  quarter: 3,
  year: 12,
  all: null,
};

/**
 * First day of the period: `today` minus 1 / 3 / 12 calendar months, the day clamped to the
 * month's length (31 May − 3 months = 28 Feb); null for «all».
 */
export function periodStart(today: string, period: WeightPeriod) {
  const months = MONTHS[period];
  if (months === null) return null;
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m - 1 - months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 - months, Math.min(d, last)))
    .toISOString()
    .slice(0, 10);
}

/** Air left of the first weighing: a share of its distance to today (OCT-446 §5). */
const PAD = 0.08;
/** The narrowest x axis: today minus this many days, so 5 calendar days. */
const MIN_DAYS = 4;

/**
 * First day of the x axis (OCT-446 §5): the first weighing in the period minus PAD of the
 * history, at least a day; never before the period start; at least MIN_DAYS before today.
 */
export function axisStart(first: string, from: string | null, today: string) {
  let start = addDays(
    first,
    -Math.max(1, Math.ceil(daysBetween(first, today) * PAD)),
  );
  if (from !== null && start < from) start = from;
  if (daysBetween(start, today) < MIN_DAYS) start = addDays(today, -MIN_DAYS);
  return start;
}

/** `day` is the day alone, `day_month` adds the short month; January reads as its year. */
export type XTick = {
  date: string;
  kind: 'day' | 'day_month' | 'month' | 'year';
};

/** Every `step`-th of `dates`, counted back from the last so the latest is always kept. */
function thin(dates: string[], steps: number[]) {
  const step =
    steps.find((s) => Math.ceil(dates.length / s) <= 5) ?? steps.at(-1)!;
  return dates.filter((_, i) => (dates.length - 1 - i) % step === 0);
}

/**
 * X labels from `start` to today (OCT-446 §5): up to 45 days, every 1/2/3/7/14 days back from
 * today; up to 400 days, month starts; longer, Jan 1 of each year.
 */
export function xTicks(start: string, today: string): XTick[] {
  const span = daysBetween(start, today);
  if (span <= 45) {
    const step = [1, 2, 3, 7, 14].find((s) => Math.floor(span / s) <= 4)!;
    const dates: string[] = [];
    for (let d = today; d >= start; d = addDays(d, -step)) dates.unshift(d);
    return dates.map((date, i) => ({
      date,
      kind:
        i === 0 || date.slice(0, 7) !== dates[i - 1]!.slice(0, 7)
          ? 'day_month'
          : 'day',
    }));
  }
  const years = span > 400;
  const firsts: string[] = [];
  const [y, m] = today.split('-').map(Number) as [number, number];
  // Month (or year) starts back from today's, while still after `start`.
  for (let k = 0; ; k++) {
    const date = years
      ? `${y - k}-01-01`
      : new Date(Date.UTC(y, m - 1 - k, 1)).toISOString().slice(0, 10);
    if (date <= start) break;
    firsts.unshift(date);
  }
  return thin(firsts, years ? [1, 2, 5] : [1, 2, 3]).map((date) => ({
    date,
    kind: years || date.endsWith('-01-01') ? 'year' : 'month',
  }));
}

// 50–200 only for odd histories spanning most of 30–300 kg (or 66–660 lb).
const STEPS = [0.5, 1, 2, 5, 10, 20, 50, 100, 200];

/**
 * Value axis over `values` (weights, trend, goal, in shown units): the smallest step of
 * 0.5 / 1 / 2 / 5 / 10 / 20 / … whose axis, ends rounded out to a step with some air, has at
 * most 4 steps; at least 2 steps tall — so 3 to 5 grid lines.
 */
export function weightAxis(values: readonly number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  let step = 0;
  let lo = 0;
  let hi = 0;
  for (step of STEPS) {
    lo = Math.floor((min - step * 0.3) / step) * step;
    hi = Math.ceil((max + step * 0.3) / step) * step;
    if (hi - lo <= step * 4) break;
  }
  if (hi - lo < step * 2) {
    lo -= step;
    hi += step;
  }
  const ticks = [];
  // Counted in steps, so 0.5 + 0.5 + … never drifts to 80.49999.
  for (let i = 0; i <= Math.round((hi - lo) / step); i++)
    ticks.push(lo + i * step);
  return { lo, hi, step, ticks };
}

/** Index of the value in ascending `xs` closest to `x` (binary search); -1 when empty. */
export function nearest(xs: readonly number[], x: number) {
  let lo = 0;
  let hi = xs.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && x - xs[lo - 1]! <= xs[lo]! - x ? lo - 1 : lo;
}
