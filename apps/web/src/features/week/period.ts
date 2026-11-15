import {
  addDays,
  isoWeekId,
  monthOf,
  parsePeriodId,
  sumDay,
  weekOf,
  type DayTotals,
  type Meal,
} from '@oct/shared';

export type PeriodMode = 'week' | 'month';

export const periodOf = (mode: PeriodMode, date: string) =>
  mode === 'week' ? weekOf(date) : monthOf(date);

/** The first day of the period `step` periods away from the one holding `date`. */
export function stepPeriod(mode: PeriodMode, date: string, step: -1 | 1) {
  const { from, to } = periodOf(mode, date);
  return step < 0 ? periodOf(mode, addDays(from, -1)).from : addDays(to, 1);
}

/** `/week/2026-W46` or `/month/2026-11` for the period holding `date` (OCT-19 D.3). */
export const periodPath = (mode: PeriodMode, date: string) =>
  `/${mode}/${mode === 'week' ? isoWeekId(date) : date.slice(0, 7)}`;

/** The period a `/week/:id` or `/month/:id` address may show: a real one of that kind, not in the future. */
export function periodOfId(mode: PeriodMode, id: string, today: string) {
  const period = parsePeriodId(id);
  return period &&
    id.includes('W') === (mode === 'week') &&
    period.from <= today
    ? period
    : null;
}

/**
 * Pager label (OCT-19 §4): «This week / November 10 – 16», «Last week / …», then the range
 * alone («Oct 27 – Nov 2», the year below when it is not this year); a month is «November / 2026».
 */
export function periodLabel(
  mode: PeriodMode,
  date: string,
  today: string,
  locale: string,
  t: (key: 'week.this' | 'week.last') => string,
) {
  const { from, to } = periodOf(mode, date);
  const utc = (d: string) => new Date(`${d}T00:00:00Z`);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
  if (mode === 'month') {
    const month = format({ month: 'long' }).format(utc(from));
    // «ноябрь» → «Ноябрь».
    return {
      label: month.charAt(0).toUpperCase() + month.slice(1),
      sub: from.slice(0, 4),
    };
  }
  const range = (month: 'long' | 'short') =>
    format({ day: 'numeric', month }).formatRange(utc(from), utc(to));
  const current = weekOf(today).from;
  const near =
    from === current
      ? t('week.this')
      : from === addDays(current, -7)
        ? t('week.last')
        : null;
  if (near) return { label: near, sub: range('long') };
  return {
    label: range('short'),
    sub: to.slice(0, 4) === today.slice(0, 4) ? null : to.slice(0, 4),
  };
}

/** Every day of `from..to` with its totals (`sumDay`), empty days as zeros: what `summarize` takes. */
export function periodDays(
  meals: readonly Meal[],
  from: string,
  to: string,
): DayTotals[] {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dayMeals = meals.filter((m) => m.localDate === d);
    days.push({ date: d, ...sumDay(dayMeals), meals: dayMeals.length });
  }
  return days;
}
