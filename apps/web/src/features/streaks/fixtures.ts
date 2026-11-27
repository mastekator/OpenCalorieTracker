import type { DayFact, StreakState, StreakWeek } from '@oct/shared';
import type { Streaks } from '../../data/streaks';

/** Thursday, 19 November 2026, as in the design (OCT-184). */
export const TODAY = '2026-11-19';

const trail = (statuses: StreakWeek['status'][]): StreakWeek[] =>
  statuses.map((status, i) => ({
    // Mondays from 14 September to 16 November.
    from: new Date(Date.UTC(2026, 8, 14 + 7 * i)).toISOString().slice(0, 10),
    status,
  }));

const day = (date: string): DayFact => ({
  date,
  meals: 2,
  photoMeals: 1,
  preciseDishes: 0,
  ownDishes: 0,
  loggedDate: date,
});

/** Mon, Tue and Thu of this week logged. */
export const DAYS = ['2026-11-16', '2026-11-17', '2026-11-19'].map(day);

/** 2.1: six weeks in a row, best nine, one freeze spent. */
export const RUNNING: StreakState = {
  current: 6,
  best: 9,
  freezes: 1,
  weeksToFreeze: 2,
  weeks: [],
  trail: trail([
    'counted',
    'short',
    'counted',
    'counted',
    'frozen',
    'counted',
    'counted',
    'counted',
    'counted',
    'current',
  ]),
  week: { days: 3, target: 5, counted: false },
};

/** 3.2: the last week didn't add up and no freeze was left. */
export const RESTART: StreakState = {
  ...RUNNING,
  current: 0,
  freezes: 0,
  trail: trail([
    'counted',
    'counted',
    'counted',
    'counted',
    'counted',
    'counted',
    'counted',
    'short',
    'short',
    'current',
  ]),
};

/** This week already counted. */
export const COUNTED: StreakState = {
  ...RUNNING,
  current: 7,
  trail: RUNNING.trail.map((w) =>
    w.status === 'current' ? { ...w, status: 'counted' } : w,
  ),
  week: { days: 6, target: 5, counted: true },
};

/** 3.1: no entries yet. */
export const NEWBIE: StreakState = {
  current: 0,
  best: 0,
  freezes: 1,
  weeksToFreeze: 4,
  weeks: [],
  trail: [],
  week: { days: 0, target: 5, counted: false },
};

export const streaksOf = (streak: StreakState, on = true): Streaks => ({
  on,
  fullSyncAt: 1,
  days: streak === NEWBIE ? [] : DAYS,
  streak,
  awards: [],
  stored: [],
  month: '2026-11',
  challenges: [],
  months: [],
  celebrate: [],
});
