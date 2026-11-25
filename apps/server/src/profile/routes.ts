import type { Database } from 'better-sqlite3';
import { Hono } from 'hono';
import {
  birthDateError,
  deadlineError,
  profileRequestSchema,
  targetWeightError,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { saveProfile } from '../weight/store.js';
import { readProfile } from './norm.js';

/** Local date of the process, i.e. in the installation's TZ (ADR-0014 §3). */
export const serverToday = () => new Date().toLocaleDateString('sv');

/** The user's IANA zone; undefined = the server's (ADR-0027 §4). */
export const userTimeZone = (db: Database, userId: number) =>
  (db
    .prepare('SELECT time_zone FROM users WHERE id = ?')
    .pluck()
    .get(userId) as string | null) ?? undefined;

/** Today in the user's zone, for requests without a device: tokens, MCP, schedules (ADR-0027 §5). */
export const userToday = (db: Database, userId: number) =>
  new Date().toLocaleDateString('sv', { timeZone: userTimeZone(db, userId) });

/** The current user's profile and manual norm (ADR-0014 §5). */
export function profileRoutes({ db }: AppDeps) {
  return new Hono<AuthEnv>()
    .get('/profile', requireUser, (c) => c.json(readProfile(db, c.var.user.id)))
    .put(
      '/profile',
      requireUser,
      validate('json', profileRequestSchema),
      (c) => {
        const userId = c.var.user.id;
        const { profile: p, manual: m } = c.req.valid('json');
        const old = readProfile(db, userId).profile;
        const today = serverToday();

        // Date- and change-dependent rules run only on changed fields, so a stale
        // deadline, an old birth date or a reached goal never block saving a new weight (E-1.7, E-1.8).
        const errors: { path: string[]; code: string }[] = [];
        const check = (
          field: string,
          changed: boolean,
          code: string | null,
        ) => {
          if (changed && code) errors.push({ path: ['profile', field], code });
        };
        check(
          'birthDate',
          p.birthDate !== old.birthDate,
          p.birthDate && birthDateError(p.birthDate, today),
        );
        check(
          'deadline',
          p.deadline !== old.deadline,
          p.deadline && deadlineError(p.deadline, today),
        );
        check(
          'targetWeightKg',
          p.goal !== old.goal || p.targetWeightKg !== old.targetWeightKg,
          targetWeightError(p),
        );
        if (errors.length) throw new ApiError(400, 'validation_failed', errors);

        db.transaction(() =>
          saveProfile(db, userId, p, m, old.weightKg, today),
        )();
        return c.json(readProfile(db, userId));
      },
    );
}
