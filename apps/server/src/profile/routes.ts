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
import { bumpRev } from '../sync/rev.js';
import { readProfile } from './norm.js';

/** Local date of the process, i.e. in the installation's TZ (ADR-0014 §3). */
const serverToday = () => new Date().toLocaleDateString('sv');

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
          db
            .prepare(
              `INSERT INTO profiles (user_id, sex, birth_date, height_cm, weight_kg, activity, goal,
             target_weight_kg, deadline, kcal_override, protein_pct, fat_pct, carbs_pct, updated_at, rev)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET
             sex = excluded.sex, birth_date = excluded.birth_date, height_cm = excluded.height_cm,
             weight_kg = excluded.weight_kg, activity = excluded.activity, goal = excluded.goal,
             target_weight_kg = excluded.target_weight_kg, deadline = excluded.deadline,
             kcal_override = excluded.kcal_override, protein_pct = excluded.protein_pct,
             fat_pct = excluded.fat_pct, carbs_pct = excluded.carbs_pct,
             updated_at = excluded.updated_at, rev = excluded.rev`,
            )
            .run(
              userId,
              p.sex,
              p.birthDate,
              p.heightCm,
              p.weightKg,
              p.activity,
              p.goal,
              p.targetWeightKg,
              p.deadline,
              m?.kcal ?? null,
              m?.proteinPct ?? null,
              m?.fatPct ?? null,
              m?.carbsPct ?? null,
              Date.now(),
              bumpRev(db, userId),
            ),
        )();
        return c.json(readProfile(db, userId));
      },
    );
}
