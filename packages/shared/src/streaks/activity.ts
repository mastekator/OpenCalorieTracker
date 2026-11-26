import { addDays, addYears, weekOf } from '../dates.js';
import type { DayFact } from './streaks.js';

export type ActivityLevel = 0 | 1 | 2 | 3;

export interface ActivityCell {
  date: string;
  meals: number;
  /** 0, 1, 2 or 3+ meals. */
  level: ActivityLevel;
}

export interface ActivityWeek {
  /** Monday of the column. */
  from: string;
  /** Monday to Sunday; null outside the window, before the first logged day and after today. */
  days: (ActivityCell | null)[];
}

export interface ActivityMap {
  /** First day of the window: the day after `today` a year ago. */
  from: string;
  weeks: ActivityWeek[];
}

/** Activity over the rolling year up to `today`, in Monday-first week columns; reads only meal counts. */
export const activityMap = (
  days: readonly Pick<DayFact, 'date' | 'meals'>[],
  today: string,
): ActivityMap => {
  // Day after today, a year back: 2028-02-29 gives 2027-03-01.
  const from = addYears(addDays(today, 1), -1);
  const meals = new Map(
    days.filter((d) => d.meals > 0).map((d) => [d.date, d.meals]),
  );
  const first = [...meals.keys()].sort()[0];
  const start = first && first > from ? first : from;
  const weeks: ActivityWeek[] = [];
  for (let mon = weekOf(from).from; mon <= today; mon = addDays(mon, 7)) {
    weeks.push({
      from: mon,
      days: Array.from({ length: 7 }, (_, i) => {
        const date = addDays(mon, i);
        if (!first || date < start || date > today) return null;
        const n = meals.get(date) ?? 0;
        return { date, meals: n, level: Math.min(n, 3) as ActivityLevel };
      }),
    });
  }
  return { from, weeks };
};
