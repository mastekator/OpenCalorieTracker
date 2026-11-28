import {
  AWARDS,
  REQUIRED_FIELDS,
  awardProgress,
  challengeProgress,
  dayFacts,
  grantAwards,
  monthChallenges,
  streakState,
  streaksOn,
  type AccountSettings,
  type AiStatus,
  type AwardProgress,
  type ChallengeKey,
  type ChallengeMonth,
  type ChallengeProgress,
  type DayFact,
  type ProfileResponse,
  type StoredAward,
  type StreakState,
} from '@oct/shared';
import { emitChange } from './changes';
import type { Db } from './db';
import { putAwards, putChallengeMonth } from './outbox';

/** Catalog version: awards are only ever added (AC-3.6), so its length changes with each release that adds some. */
export const AWARDS_CATALOG = AWARDS.length;

export interface Streaks {
  /** The effective switch (AC-6.2). */
  on: boolean;
  /** When the first full pull ended; null before it, and then no award is granted (ADR-0032 §4). */
  fullSyncAt: number | null;
  /** When a pull page last landed: «Map as of {date}» while the full pull isn't done (OCT-184 3.4). */
  pulledAt: number | null;
  /** Monday of the frozen week whose notice was closed here (OCT-184 3.3). */
  freezeNoticeSeen: string | null;
  days: DayFact[];
  streak: StreakState;
  /** Every award in catalog order. */
  awards: AwardProgress[];
  /** Earned awards. */
  stored: StoredAward[];
  /** AI can read photos: else the «Photo» awards are hidden until one is earned (AC-3.10). */
  photoAi: boolean;
  /** `YYYY-MM` of today. */
  month: string;
  challenges: ChallengeProgress[];
  /** Stored months; past ones are closed by the first look after their end. */
  months: ChallengeMonth[];
  /** Not seen and not granted retro on this device: the congratulation strip (OCT-501). */
  celebrate: StoredAward[];
}

/** dayFacts of the last read, per database: rebuilt when the copy's rev or the queue changes. */
const memo = new WeakMap<Db, { key: string; days: DayFact[] }>();

async function daysOf(db: Db) {
  const [rev, seqs] = await Promise.all([
    db.get('kv', 'rev'),
    db.getAllKeys('outbox'),
  ]);
  // Every local meal change queues an op and every pull moves rev.
  const key = `${rev}:${seqs.length}:${seqs.at(-1)}`;
  const hit = memo.get(db);
  if (hit?.key === key) return hit.days;
  const days = dayFacts(await db.getAll('meals'));
  memo.set(db, { key, days });
  return days;
}

/** Runs one at a time per database: two mounted hooks must not grant the same award twice at once. */
const chains = new WeakMap<Db, Promise<unknown>>();

/**
 * Streaks, awards and this month's challenges from the local copy (ADR-0032 §4). While the
 * switch is on and the first full pull is done, it also grants awards and writes the months.
 */
export function streaks(db: Db, today: string): Promise<Streaks> {
  const run = (chains.get(db) ?? Promise.resolve()).then(
    () => compute(db, today),
    () => compute(db, today),
  );
  chains.set(db, run);
  return run;
}

async function compute(db: Db, today: string): Promise<Streaks> {
  const [
    days,
    settings,
    profile,
    aiStatus,
    fullSyncAt,
    pulledAt,
    freezeNoticeSeen,
  ] = await Promise.all([
    daysOf(db),
    db.get('kv', 'settings') as Promise<AccountSettings | undefined>,
    db.get('kv', 'profile') as Promise<ProfileResponse | undefined>,
    db.get('kv', 'aiStatus') as Promise<AiStatus | undefined>,
    db.get('kv', 'fullSyncAt') as Promise<number | undefined>,
    db.get('kv', 'pulledAt') as Promise<number | undefined>,
    db.get('kv', 'freezeNoticeSeen') as Promise<string | undefined>,
  ]);
  const p = profile?.profile ?? null;
  const on = streaksOn(settings ?? {}, p, today);
  const profileDone = !!p && REQUIRED_FIELDS.every((f) => p[f] != null);
  const firstDay = days.find((d) => d.meals > 0)?.date ?? null;
  const streak = streakState(days, { today, firstDay });
  const month = today.slice(0, 7);
  const write = on && !!fullSyncAt;

  let months = await db.getAll('challengeMonths');
  const row = months.find((m) => m.month === month);
  const photoAi = aiStatus?.recognition === 'ready';
  const keys = (row?.keys ??
    monthChallenges(month, {
      photoAi,
      profileDone,
    })) as ChallengeKey[];
  const challenges = challengeProgress(month, keys, days, { profileDone });

  if (write) {
    let wrote = false;
    for (const m of months) {
      if (m.month >= month || m.closed) continue;
      const past = m.keys as ChallengeKey[];
      const done = doneOf(
        challengeProgress(m.month, past, days, { profileDone }),
        null,
      );
      await putChallengeMonth(db, m.month, {
        keys: past,
        done,
        closed: true,
      });
      wrote = true;
    }
    const done = doneOf(challenges, today);
    if (!row || Object.keys(done).some((k) => !row.done[k])) {
      await putChallengeMonth(db, month, { keys, done, closed: false });
      wrote = true;
    }
    if (wrote) months = await db.getAll('challengeMonths');
  }

  const awards = awardProgress(days, streak, months, {
    birthDate: p?.birthDate ?? null,
  });
  let stored = await db.getAll('awards');
  const quiet = new Set(
    ((await db.get('kv', 'awardsQuiet')) as string[] | undefined) ?? [],
  );

  if (write) {
    const [catalog, importRev, rev] = await Promise.all([
      db.get('kv', 'awardsCatalog') as Promise<number | undefined>,
      db.get('kv', 'awardsRetro') as Promise<number | undefined>,
      db.get('kv', 'rev') as Promise<number | undefined>,
    ]);
    // First run after turning on, a new catalog or an import: no congratulation storm (AC-3.5).
    const retro = catalog !== AWARDS_CATALOG || importRev !== undefined;
    const grant = grantAwards(awards, stored, retro ? 'retro' : 'live');
    if (grant.awards.length) {
      if (retro) {
        for (const a of grant.awards) quiet.add(a.key);
        await db.put('kv', [...quiet], 'awardsQuiet');
      }
      await putAwards(db, grant.awards);
      stored = await db.getAll('awards');
    }
    if (catalog !== AWARDS_CATALOG)
      await db.put('kv', AWARDS_CATALOG, 'awardsCatalog');
    // A pull after the commit has brought the imported meals: they are granted, live again.
    if (importRev !== undefined && rev !== importRev)
      await db.delete('kv', 'awardsRetro');
  } else if (!on && (await db.get('kv', 'awardsCatalog')) !== undefined) {
    // Turning the switch back on grants what was earned meanwhile retro.
    await db.delete('kv', 'awardsCatalog');
  }

  return {
    on,
    fullSyncAt: fullSyncAt ?? null,
    pulledAt: pulledAt ?? null,
    freezeNoticeSeen: freezeNoticeSeen ?? null,
    days,
    streak,
    awards,
    stored,
    photoAi,
    month,
    challenges,
    months,
    celebrate:
      on && fullSyncAt
        ? stored.filter((a) => !a.seen && !quiet.has(a.key))
        : [],
  };
}

/** Done challenges with their day; `profile` has none, so it takes `today` (null: skipped). */
const doneOf = (progress: ChallengeProgress[], today: string | null) =>
  Object.fromEntries(
    progress.flatMap((c) => {
      const day = c.doneOn ?? (c.done ? today : null);
      return day ? [[c.key, day]] : [];
    }),
  ) as Partial<Record<ChallengeKey, string>>;

/** The congratulation was shown or the medal opened: `seen` goes to every device (ADR-0032 §4). */
export const markSeen = (db: Db, awards: StoredAward[]) =>
  putAwards(
    db,
    awards.map((a) => ({ ...a, seen: true })),
  );

/**
 * After a committed import: grants stay retro until a pull moves rev past this one, so the
 * imported diary is never congratulated, even when the pull comes late (ADR-0026, AC-3.5).
 */
export async function markImportRetro(db: Db) {
  await db.put(
    'kv',
    ((await db.get('kv', 'rev')) as number) ?? 0,
    'awardsRetro',
  );
}

/** × on «Week frozen»: this device doesn't show it for that week again (OCT-184 3.3). */
export async function closeFreezeNotice(db: Db, from: string) {
  await db.put('kv', from, 'freezeNoticeSeen');
  emitChange();
}
