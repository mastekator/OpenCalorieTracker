import { addDays, daysBetween, monthOf } from '../dates.js';
import { WEEK_TARGET, type DayFact, type StreakState } from './streaks.js';

export type AwardCategory =
  'path' | 'streak' | 'days' | 'months' | 'photo' | 'accuracy' | 'secret';
export type AwardRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** What a counter counts; each award is a target on one counter. */
type Counter =
  | 'weeks'
  | 'streak'
  | 'days'
  | 'challenges'
  | 'perfectMonths'
  | 'fullMonth'
  | 'photoMeals'
  | 'preciseDishes'
  | 'ownDishes'
  | 'comeback'
  | 'birthday'
  | 'newYear'
  | 'freeze'
  | 'backfill'
  | 'daysInRow';

export interface Award {
  /** Stable (AC-3.6): never renamed; new awards are new entries. */
  key: string;
  category: AwardCategory;
  rarity: AwardRarity;
  target: number;
  counter: Counter;
}

const award = (
  key: string,
  category: AwardCategory,
  rarity: AwardRarity,
  counter: Counter,
  target = 1,
): Award => ({ key, category, rarity, target, counter });

/** The catalog in the order of the awards screen (product OCT-180, table 3.3). */
export const AWARDS: readonly Award[] = [
  award('weeks_1', 'path', 'common', 'weeks', 1),
  award('weeks_4', 'path', 'common', 'weeks', 4),
  award('weeks_12', 'path', 'rare', 'weeks', 12),
  award('weeks_26', 'path', 'epic', 'weeks', 26),
  award('weeks_52', 'path', 'epic', 'weeks', 52),
  award('weeks_104', 'path', 'legendary', 'weeks', 104),
  award('streak_2', 'streak', 'common', 'streak', 2),
  award('streak_8', 'streak', 'rare', 'streak', 8),
  award('streak_16', 'streak', 'epic', 'streak', 16),
  award('streak_26', 'streak', 'epic', 'streak', 26),
  award('streak_52', 'streak', 'legendary', 'streak', 52),
  award('days_1', 'days', 'common', 'days', 1),
  award('days_30', 'days', 'common', 'days', 30),
  award('days_100', 'days', 'rare', 'days', 100),
  award('days_365', 'days', 'epic', 'days', 365),
  award('days_1000', 'days', 'legendary', 'days', 1000),
  award('challenge_1', 'months', 'common', 'challenges'),
  award('month_3of3', 'months', 'rare', 'perfectMonths'),
  award('month_3of3_x6', 'months', 'epic', 'perfectMonths', 6),
  award('month_full', 'months', 'rare', 'fullMonth'),
  award('photo_1', 'photo', 'common', 'photoMeals', 1),
  award('photo_100', 'photo', 'rare', 'photoMeals', 100),
  award('photo_500', 'photo', 'epic', 'photoMeals', 500),
  award('grams_25', 'accuracy', 'common', 'preciseDishes', 25),
  award('grams_250', 'accuracy', 'epic', 'preciseDishes', 250),
  award('manual_25', 'accuracy', 'rare', 'ownDishes', 25),
  award('secret_comeback', 'secret', 'rare', 'comeback'),
  award('secret_birthday', 'secret', 'rare', 'birthday'),
  award('secret_new_year', 'secret', 'common', 'newYear'),
  award('secret_freeze', 'secret', 'common', 'freeze'),
  award('secret_backfill', 'secret', 'common', 'backfill'),
  award('secret_days_100_row', 'secret', 'epic', 'daysInRow', 100),
];

export const AWARD_KEYS: ReadonlySet<string> = new Set(
  AWARDS.map((a) => a.key),
);

/** A month's challenges as the server keeps them (ADR-0032 §3). */
export interface ChallengeMonth {
  /** 'YYYY-MM' */
  month: string;
  keys: string[];
  /** Done challenges: key → day it was done. */
  done: Record<string, string>;
  closed: boolean;
}

export interface AwardProgress {
  key: string;
  done: boolean;
  value: number;
  target: number;
  /** Diary day the award's condition was met; set when done. */
  achievedOn?: string;
}

export interface StoredAward {
  key: string;
  earnedOn: string;
  seen: boolean;
}

/** Comebacks need ≥ 28 empty days between two logged days. */
const COMEBACK_GAP_DAYS = 29;

const isLeap = (year: string) => addDays(`${year}-02-28`, 1).endsWith('02-29');

const sorted = (dates: string[]) => dates.sort((a, b) => (a < b ? -1 : 1));

/**
 * For each counter, `reached[n - 1]` is the diary day the counter first reached n,
 * so a target t is met on `reached[t - 1]` and the value is `reached.length`.
 * Reads only day facts, weeks and closed months: never kcal or the norm (ADR-0032 §1).
 */
const counters = (
  days: readonly DayFact[],
  streak: Pick<StreakState, 'weeks'>,
  months: readonly ChallengeMonth[],
  birthDate: string | null,
): Record<Counter, string[]> => {
  const r = Object.fromEntries(
    AWARDS.map((a) => [a.counter, [] as string[]]),
  ) as Record<Counter, string[]>;
  const logged = days.filter((d) => d.meals > 0);
  const byDate = new Map(logged.map((d) => [d.date, d]));
  const birthMd = birthDate?.slice(5);

  let prev: string | null = null;
  let row = 0;
  for (const d of logged) {
    r.days.push(d.date);
    for (let i = 0; i < d.photoMeals; i++) r.photoMeals.push(d.date);
    for (let i = 0; i < d.preciseDishes; i++) r.preciseDishes.push(d.date);
    for (let i = 0; i < d.ownDishes; i++) r.ownDishes.push(d.date);
    const md = d.date.slice(5);
    if (md === '01-01') r.newYear.push(d.date);
    if (
      md === birthMd ||
      (birthMd === '02-29' && md === '02-28' && !isLeap(d.date.slice(0, 4)))
    )
      r.birthday.push(d.date);
    if (prev && daysBetween(prev, d.date) >= COMEBACK_GAP_DAYS)
      r.comeback.push(d.date);
    row = prev && daysBetween(prev, d.date) === 1 ? row + 1 : 1;
    if (row > r.daysInRow.length) r.daysInRow.push(d.date);
    const { from, to } = monthOf(d.date);
    // the run ending on the month's last day covers the whole month
    if (d.date === to && row > daysBetween(from, to)) r.fullMonth.push(d.date);
    prev = d.date;
  }

  let current = 0;
  const backfills: string[] = [];
  for (const { from, status } of streak.weeks) {
    if (status === 'frozen' && !r.freeze.length)
      r.freeze.push(addDays(from, 7));
    if (status === 'short') current = 0;
    if (status !== 'counted') continue;
    const week = Array.from({ length: 7 }, (_, i) =>
      byDate.get(addDays(from, i)),
    ).filter((d) => d !== undefined);
    // a counted week has min(5, its logged days) as its target: the first week is never longer
    const need = Math.min(WEEK_TARGET, week.length);
    const countedOn = week[need - 1]!.date;
    r.weeks.push(countedOn);
    if (++current > r.streak.length) r.streak.push(countedOn);
    // unknown save time (data before logged_at) counts as on time: no false backfills
    const savedOn = sorted(week.map((d) => d.loggedDate ?? d.date));
    if (savedOn[need - 1]! > addDays(from, 6))
      backfills.push(savedOn[need - 1]!);
  }
  r.backfill = sorted(backfills).slice(0, 1);

  for (const m of months) {
    r.challenges.push(...Object.values(m.done));
    if (m.closed && m.keys.length > 0 && m.keys.every((k) => m.done[k]))
      r.perfectMonths.push(sorted(m.keys.map((k) => m.done[k]!)).at(-1)!);
  }
  sorted(r.challenges);
  sorted(r.perfectMonths);
  return r;
};

/** Progress of every award in catalog order (ADR-0032 §1). */
export const awardProgress = (
  days: readonly DayFact[],
  streak: Pick<StreakState, 'weeks'>,
  months: readonly ChallengeMonth[],
  ctx: { birthDate: string | null },
): AwardProgress[] => {
  const r = counters(days, streak, months, ctx.birthDate);
  return AWARDS.map(({ key, target, counter }) => {
    const reached = r[counter];
    const achievedOn = reached[target - 1];
    return achievedOn
      ? { key, done: true, value: reached.length, target, achievedOn }
      : { key, done: false, value: reached.length, target };
  });
};

/**
 * What to send to `putAwards`: every done award not stored yet, never a removal (AC-3.3).
 * 'live' celebrates them; 'retro' (first enable, import, new catalog) only marks them new (AC-3.5).
 */
export const grantAwards = (
  progress: readonly AwardProgress[],
  stored: readonly Pick<StoredAward, 'key'>[],
  mode: 'live' | 'retro',
) => {
  const have = new Set(stored.map((a) => a.key));
  const awards: StoredAward[] = progress
    .filter((p) => p.achievedOn && !have.has(p.key))
    .map((p) => ({ key: p.key, earnedOn: p.achievedOn!, seen: false }));
  return { awards, celebrate: mode === 'live' && awards.length > 0 };
};
