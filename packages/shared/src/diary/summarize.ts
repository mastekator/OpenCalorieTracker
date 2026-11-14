import { daysBetween } from '../dates.js';
import type { Meal } from '../meals.js';
import type { EffectiveNorm, Macros } from '../norm/calculate.js';

const each = (f: (k: keyof Macros) => number): Macros => ({
  kcal: f('kcal'),
  proteinG: f('proteinG'),
  fatG: f('fatG'),
  carbsG: f('carbsG'),
});

/** One day of a period; `meals` is how many meals were logged. */
export interface DayTotals extends Macros {
  date: string;
  meals: number;
}

/** The day's totals from its meals, unrounded (AC-0.3); the web and the server use the same sum. */
export const sumDay = (meals: readonly Meal[]): Macros =>
  each((k) => meals.reduce((s, m) => s + m[k], 0));

/** `norm − eaten` for kcal and each macro: negative is over, exactly 0 is not (E-1.1). */
export const remainingOf = (norm: Macros, eaten: Macros): Macros =>
  each((k) => norm[k] - eaten[k]);

export interface Summary {
  eaten: Macros;
  /** `norm × days in the period`; null without a norm (E-3.1). */
  budget: Macros | null;
  remaining: Macros | null;
  /**
   * Remaining kcal per day from `today` to the period's end inclusive; ≤ 0 is over (E-3.6).
   * Null without a norm or when `today` is outside the period.
   */
  perRemainingDay: number | null;
  /** Averages over the days with meals only (AC-3.4); null when there are none. */
  average: Macros | null;
  daysWithMeals: number;
}

/** Everything the week and month screens show (ADR-0010), unrounded; `days` covers the whole period in order. */
export function summarize(
  days: readonly DayTotals[],
  norm: Macros | null,
  today: string,
): Summary {
  const eaten = each((k) => days.reduce((s, d) => s + d[k], 0));
  const logged = days.filter((d) => d.meals > 0);
  const budget = norm && each((k) => norm[k] * days.length);
  const remaining = budget && remainingOf(budget, eaten);
  const last = days.at(-1)?.date;
  const left =
    last && today >= days[0]!.date && today <= last
      ? daysBetween(today, last) + 1
      : 0;
  return {
    eaten,
    budget,
    remaining,
    perRemainingDay: remaining && left ? remaining.kcal / left : null,
    average: logged.length
      ? each((k) => logged.reduce((s, d) => s + d[k], 0) / logged.length)
      : null,
    daysWithMeals: logged.length,
  };
}

/** `GET /api/days/:date`: meals by `eatenAt`, their totals and the remainder against the norm. */
export interface DayResponse {
  date: string;
  meals: Meal[];
  total: Macros;
  remaining: Macros | null;
  norm: EffectiveNorm | null;
}

/** `GET /api/summary`: every day of a week or month, empty days as zeros. */
export interface SummaryResponse extends Summary {
  from: string;
  to: string;
  days: DayTotals[];
  norm: EffectiveNorm | null;
}
