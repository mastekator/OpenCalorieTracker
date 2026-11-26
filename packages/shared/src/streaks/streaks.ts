import { addDays, ageYears, daysBetween, weekOf } from '../dates.js';
import type { Meal, MealItem } from '../meals.js';

/** The part of a meal the streak math reads: never kcal or the norm (ADR-0032 §1). */
export interface StreakMeal extends Pick<Meal, 'localDate' | 'tzOffsetMin'> {
  /** Sticky "logged by photo" mark (E-3.5); absent until the server sends it. */
  recognized?: boolean;
  /** When the meal was saved on the device (ISO); absent until the server sends it. */
  loggedAt?: string;
  items: (Pick<
    MealItem,
    'grams' | 'source' | 'proteinG' | 'fatG' | 'carbsG'
  > & {
    /** Grams as recognition returned them. */
    aiGrams?: number | null;
  })[];
}

export interface DayFact {
  date: string;
  meals: number;
  photoMeals: number;
  /** Recognized dishes whose grams the user corrected. */
  preciseDishes: number;
  /** Manual dishes with any macro filled in. */
  ownDishes: number;
  /** Earliest day (in the meal's zone) a meal of this date was saved; null if unknown. */
  loggedDate: string | null;
}

const localDay = (iso: string, tzOffsetMin: number) =>
  new Date(Date.parse(iso) + tzOffsetMin * 60_000).toISOString().slice(0, 10);

/** Per-day facts, sorted by date. */
export const dayFacts = (meals: readonly StreakMeal[]): DayFact[] => {
  const byDate = new Map<string, DayFact>();
  for (const meal of meals) {
    let day = byDate.get(meal.localDate);
    if (!day) {
      day = {
        date: meal.localDate,
        meals: 0,
        photoMeals: 0,
        preciseDishes: 0,
        ownDishes: 0,
        loggedDate: null,
      };
      byDate.set(meal.localDate, day);
    }
    day.meals++;
    if (meal.recognized) day.photoMeals++;
    for (const item of meal.items) {
      if (item.aiGrams != null && item.grams !== item.aiGrams)
        day.preciseDishes++;
      if (
        item.source === 'manual' &&
        (item.proteinG > 0 || item.fatG > 0 || item.carbsG > 0)
      )
        day.ownDishes++;
    }
    if (meal.loggedAt) {
      const logged = localDay(meal.loggedAt, meal.tzOffsetMin);
      if (day.loggedDate === null || logged < day.loggedDate)
        day.loggedDate = logged;
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
};

export type WeekStatus = 'counted' | 'frozen' | 'short' | 'current';

export interface StreakWeek {
  /** Monday of the week. */
  from: string;
  status: WeekStatus;
}

export interface StreakState {
  /** Counted weeks in the running streak; frozen weeks keep it without adding. */
  current: number;
  best: number;
  freezes: number;
  /** Counted weeks left to the next freeze; null at the cap. */
  weeksToFreeze: number | null;
  /** Every week from the first one to the current, oldest first. */
  weeks: StreakWeek[];
  /** The last TRAIL_WEEKS of `weeks`. */
  trail: StreakWeek[];
  /** The current week: logged days and how many it needs. */
  week: { days: number; target: number; counted: boolean };
}

export const WEEK_TARGET = 5;
export const MAX_FREEZES = 2;
export const WEEKS_PER_FREEZE = 4;
export const TRAIL_WEEKS = 10;

/**
 * Streak of weeks with ≥5 logged days, recomputed from the diary in one pass (ADR-0032 §1).
 * `firstDay` is the first diary day; its week needs min(5, days left to Sunday) (E-1.1).
 */
export const streakState = (
  days: readonly Pick<DayFact, 'date' | 'meals'>[],
  { today, firstDay }: { today: string; firstDay: string | null },
): StreakState => {
  const logged = new Set(days.filter((d) => d.meals > 0).map((d) => d.date));
  const thisWeek = weekOf(today).from;
  let current = 0;
  let best = 0;
  let freezes = 1; // gift on start
  let run = 0; // counted weeks towards the next freeze
  const weeks: StreakWeek[] = [];
  let week = { days: 0, target: WEEK_TARGET, counted: false };

  const start = firstDay && firstDay <= today ? firstDay : null;
  for (
    let from = start && weekOf(start).from;
    from && from <= thisWeek;
    from = addDays(from, 7)
  ) {
    const first = start! > from ? start! : from;
    const target = Math.min(
      WEEK_TARGET,
      daysBetween(first, addDays(from, 6)) + 1,
    );
    let count = 0;
    for (let i = 0; i < 7; i++) if (logged.has(addDays(from, i))) count++;
    const isCurrent = from === thisWeek;
    let status: WeekStatus;
    if (count >= target) {
      status = 'counted';
      current++;
      if (freezes < MAX_FREEZES && ++run === WEEKS_PER_FREEZE) {
        freezes++;
        run = 0;
      }
    } else if (isCurrent) status = 'current';
    else if (current > 0 && freezes > 0) {
      status = 'frozen';
      freezes--;
    } else {
      status = 'short';
      current = 0;
      run = 0;
    }
    if (freezes === MAX_FREEZES) run = 0;
    best = Math.max(best, current);
    weeks.push({ from, status });
    if (isCurrent)
      week = { days: count, target, counted: status === 'counted' };
  }

  return {
    current,
    best,
    freezes,
    weeksToFreeze: freezes === MAX_FREEZES ? null : WEEKS_PER_FREEZE - run,
    weeks,
    trail: weeks.slice(-TRAIL_WEEKS),
    week,
  };
};

/** Effective switch (AC-6.2): the explicit choice, else off under 18, else on. */
export const streaksOn = (
  settings: { streaksEnabled?: boolean | null },
  profile: { birthDate: string | null } | null,
  today: string,
) => {
  if (typeof settings.streaksEnabled === 'boolean')
    return settings.streaksEnabled;
  const birthDate = profile?.birthDate;
  return !(birthDate && ageYears(birthDate, today) < 18);
};
