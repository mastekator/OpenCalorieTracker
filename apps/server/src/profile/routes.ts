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
import { readProfile, writeProfile } from './norm.js';

/** Local date of the process, i.e. in the installation's TZ (ADR-0014 §3). */
export const serverToday = () => new Date().toLocaleDateString('sv');

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

        db.transaction(() => writeProfile(db, userId, p, m))();
        return c.json(readProfile(db, userId));
      },
    );
}
