import type { Meal } from '@oct/shared';

/** Wall-clock time where the meal was eaten, as a Date whose UTC fields are local. */
export const localClock = (meal: Pick<Meal, 'eatenAt' | 'tzOffsetMin'>) =>
  new Date(Date.parse(meal.eatenAt) + meal.tzOffsetMin * 60_000);

/** Eaten after midnight but counted to the day before (AC-0.1a): «late» badge. */
export const isLate = (
  meal: Pick<Meal, 'eatenAt' | 'tzOffsetMin' | 'localDate'>,
) => localClock(meal).toISOString().slice(0, 10) !== meal.localDate;
