import { addDays, monthOf } from '../dates.js';
import type { DayFact } from './streaks.js';

/** Stable keys in the product order (OCT-180); the server checks `keys` against them. */
export const CHALLENGE_KEYS = [
  'days_20',
  'full_week',
  'photo_20',
  'grams_10',
  'manual_macros_5',
  'profile',
] as const;
export type ChallengeKey = (typeof CHALLENGE_KEYS)[number];

export const CHALLENGE_TARGETS: Record<ChallengeKey, number> = {
  days_20: 20,
  full_week: 7,
  photo_20: 20,
  grams_10: 10,
  manual_macros_5: 5,
  profile: 1,
};

export const CHALLENGES_PER_MONTH = 3;

export interface ChallengeContext {
  /** Photo recognition is set up: without it photo_* and grams_* are skipped. */
  photoAi: boolean;
  /** The profile is filled in: then `profile` is skipped and counts as done. */
  profileDone: boolean;
}

const available = (key: ChallengeKey, ctx: ChallengeContext) =>
  key === 'profile'
    ? !ctx.profileDone
    : key === 'photo_20' || key === 'grams_10'
      ? ctx.photoAi
      : true;

/** 3 challenges of `month` ('YYYY-MM'): the same month always starts at the same place in the list. */
export const monthChallenges = (
  month: string,
  ctx: ChallengeContext,
): ChallengeKey[] => {
  let hash = 0;
  for (const c of month) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const n = CHALLENGE_KEYS.length;
  return Array.from({ length: n }, (_, i) => CHALLENGE_KEYS[(hash + i) % n]!)
    .filter((key) => available(key, ctx))
    .slice(0, CHALLENGES_PER_MONTH);
};

export interface ChallengeProgress {
  key: ChallengeKey;
  value: number;
  target: number;
  done: boolean;
  /** Day of the month the target was reached; null if not yet or for `profile` (the client dates it). */
  doneOn: string | null;
}

type Counted = Exclude<ChallengeKey, 'full_week' | 'profile'>;
const count: Record<Counted, (d: DayFact) => number> = {
  days_20: (d) => (d.meals > 0 ? 1 : 0),
  photo_20: (d) => d.photoMeals,
  grams_10: (d) => d.preciseDishes,
  manual_macros_5: (d) => d.ownDishes,
};

/** Progress of `keys` in `month` from the diary days of that month only; never reads kcal or the norm. */
export const challengeProgress = (
  month: string,
  keys: readonly ChallengeKey[],
  days: readonly DayFact[],
  { profileDone }: Pick<ChallengeContext, 'profileDone'>,
): ChallengeProgress[] => {
  const { from, to } = monthOf(`${month}-01`);
  const inMonth = days
    .filter((d) => d.date >= from && d.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return keys.map((key) => {
    const target = CHALLENGE_TARGETS[key];
    let value = 0;
    let doneOn: string | null = null;
    if (key === 'profile') value = profileDone ? 1 : 0;
    else if (key === 'full_week') {
      const logged = new Set(
        inMonth.filter((d) => d.meals > 0).map((d) => d.date),
      );
      const firstMonday = addDays(
        from,
        (8 - new Date(`${from}T00:00:00Z`).getUTCDay()) % 7,
      );
      // Only Monday–Sunday weeks that lie wholly inside the month.
      for (
        let mon = firstMonday;
        addDays(mon, 6) <= to;
        mon = addDays(mon, 7)
      ) {
        let n = 0;
        for (let i = 0; i < 7; i++) if (logged.has(addDays(mon, i))) n++;
        value = Math.max(value, n);
        if (n === 7 && !doneOn) doneOn = addDays(mon, 6);
      }
    } else {
      for (const d of inMonth) {
        value += count[key](d);
        if (value >= target && !doneOn) doneOn = d.date;
      }
    }
    return { key, value, target, done: value >= target, doneOn };
  });
};
