import type { Database } from 'better-sqlite3';
import { Hono } from 'hono';
import {
  awardsPutSchema,
  challengeMonthParamSchema,
  challengeMonthPutSchema,
  type ChallengeMonth,
  type StoredAward,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { validate } from '../http/validate.js';
import { bumpRev } from '../sync/rev.js';

interface AwardRow {
  key: string;
  earned_on: string;
  seen: 0 | 1;
}

interface MonthRow {
  month: string;
  keys: string;
  done: string;
  closed: 0 | 1;
}

export const toAward = (r: AwardRow): StoredAward => ({
  key: r.key,
  earnedOn: r.earned_on,
  seen: r.seen === 1,
});

export const toChallengeMonth = (r: MonthRow): ChallengeMonth => ({
  month: r.month,
  keys: JSON.parse(r.keys) as string[],
  done: JSON.parse(r.done) as Record<string, string>,
  closed: r.closed === 1,
});

/** Rows changed in (since, rev], for /api/sync. */
export const readAwardsByRev = (
  db: Database,
  userId: number,
  since: number,
  rev: number,
) =>
  (
    db
      .prepare(
        'SELECT * FROM awards WHERE user_id = ? AND rev > ? AND rev <= ? ORDER BY rev',
      )
      .all(userId, since, rev) as AwardRow[]
  ).map(toAward);

export const readChallengeMonthsByRev = (
  db: Database,
  userId: number,
  since: number,
  rev: number,
) =>
  (
    db
      .prepare(
        'SELECT * FROM challenge_months WHERE user_id = ? AND rev > ? AND rev <= ? ORDER BY rev',
      )
      .all(userId, since, rev) as MonthRow[]
  ).map(toChallengeMonth);

/**
 * Award and month facts (ADR-0032 §3): add-only and idempotent, safe to replay from the queue.
 * A replay that changes nothing keeps the row's rev, so it does not churn sync.
 */
export function streakRoutes({ db }: AppDeps) {
  const findAward = db.prepare(
    'SELECT * FROM awards WHERE user_id = ? AND key = ?',
  );
  const findMonth = db.prepare(
    'SELECT * FROM challenge_months WHERE user_id = ? AND month = ?',
  );

  return new Hono<AuthEnv>()
    .put('/awards', requireUser, validate('json', awardsPutSchema), (c) => {
      const userId = c.var.user.id;
      const out = db.transaction(() =>
        c.req.valid('json').awards.map(({ key, earnedOn, seen }) => {
          const old = findAward.get(userId, key) as AwardRow | undefined;
          // An award is never taken back: the earlier day and a shown congratulation win.
          const next: AwardRow = {
            key,
            earned_on:
              old && old.earned_on < earnedOn ? old.earned_on : earnedOn,
            seen: old?.seen || seen ? 1 : 0,
          };
          if (
            !old ||
            old.earned_on !== next.earned_on ||
            old.seen !== next.seen
          )
            db.prepare(
              `INSERT INTO awards (user_id, key, earned_on, seen, rev) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (user_id, key) DO UPDATE SET earned_on = excluded.earned_on,
                 seen = excluded.seen, rev = excluded.rev`,
            ).run(userId, key, next.earned_on, next.seen, bumpRev(db, userId));
          return toAward(next);
        }),
      )();
      return c.json({ awards: out });
    })
    .put(
      '/challenges/:month',
      requireUser,
      validate('param', challengeMonthParamSchema),
      validate('json', challengeMonthPutSchema),
      (c) => {
        const userId = c.var.user.id;
        const { month } = c.req.valid('param');
        const input = c.req.valid('json');
        const out = db.transaction(() => {
          const row = findMonth.get(userId, month) as MonthRow | undefined;
          const old = row && toChallengeMonth(row);
          // The first stored set wins, so two offline devices converge on one (ADR-0032 §3).
          const keys = old?.keys ?? input.keys;
          const done: Record<string, string> = { ...old?.done };
          // Done keys outside the stored set are dropped, not refused, so a queue never sticks.
          for (const [k, day] of Object.entries(input.done))
            if (keys.includes(k) && !(done[k] && done[k] <= day)) done[k] = day;
          const next: ChallengeMonth = {
            month,
            keys,
            done,
            closed: !!old?.closed || input.closed,
          };
          if (JSON.stringify(old) !== JSON.stringify(next))
            db.prepare(
              `INSERT INTO challenge_months (user_id, month, keys, done, closed, rev)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT (user_id, month) DO UPDATE SET done = excluded.done,
                 closed = excluded.closed, rev = excluded.rev`,
            ).run(
              userId,
              month,
              JSON.stringify(keys),
              JSON.stringify(done),
              +next.closed,
              bumpRev(db, userId),
            );
          return next;
        })();
        return c.json(out);
      },
    );
}
