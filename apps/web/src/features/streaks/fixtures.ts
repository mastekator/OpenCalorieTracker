import type {
  ChallengeProgress,
  DayFact,
  StreakState,
  StreakWeek,
} from '@oct/shared';
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

/** 3.3: the last week ended on 3 days, the freeze was spent. */
const frozenTrail = trail([
  'counted',
  'short',
  'counted',
  'counted',
  'counted',
  'counted',
  'counted',
  'counted',
  'frozen',
  'current',
]);
export const FROZEN: StreakState = {
  ...RUNNING,
  freezes: 0,
  weeksToFreeze: 4,
  weeks: frozenTrail,
  trail: frozenTrail,
};

/** The days of the frozen week 9–15 November: three logged. */
export const FROZEN_DAYS = [
  ...['2026-11-09', '2026-11-11', '2026-11-13'].map(day),
  ...DAYS,
];

const challenge = (
  key: ChallengeProgress['key'],
  value: number,
  target: number,
  doneOn: string | null = null,
): ChallengeProgress => ({
  key,
  value,
  target,
  done: value >= target,
  doneOn,
});

/** 2.1: two in progress, the full week done on 15 November. */
export const CHALLENGES = [
  challenge('days_20', 14, 20),
  challenge('full_week', 7, 7, '2026-11-15'),
  challenge('photo_20', 11, 20),
];

/** 3.1: without AI no photo challenges; the profile isn't filled in. */
export const NEWBIE_CHALLENGES = [
  challenge('profile', 0, 1),
  challenge('days_20', 0, 20),
  challenge('manual_macros_5', 0, 5),
];

export const ALL_DONE = [
  challenge('days_20', 20, 20, '2026-11-24'),
  challenge('full_week', 7, 7, '2026-11-15'),
  challenge('photo_20', 20, 20, '2026-11-26'),
];

export const streaksOf = (
  streak: StreakState,
  on = true,
  more: Partial<Streaks> = {},
): Streaks => ({
  on,
  fullSyncAt: 1,
  pulledAt: 1,
  freezeNoticeSeen: null,
  days: streak === NEWBIE ? [] : DAYS,
  streak,
  awards: [],
  stored: [],
  month: '2026-11',
  challenges: streak === NEWBIE ? NEWBIE_CHALLENGES : CHALLENGES,
  months: [],
  celebrate: [],
  ...more,
});
