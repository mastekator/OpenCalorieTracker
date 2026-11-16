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
