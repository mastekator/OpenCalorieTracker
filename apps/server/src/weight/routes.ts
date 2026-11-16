import { Hono } from 'hono';
import { z } from 'zod';
import {
  addDays,
  weighingDateError,
  weighingRequestSchema,
  type WeighingDeleteResponse,
  type WeighingPutResponse,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { readProfile } from '../profile/norm.js';
import { serverToday } from '../profile/routes.js';
import { deleteWeighing, putWeighing, syncProfileWeight } from './store.js';

const dateParam = z.object({ date: z.iso.date() });

/** The current user's weight diary (ADR-0016 §3). */
export function weightRoutes({ db }: AppDeps) {
  return new Hono<AuthEnv>()
    .put(
      '/weighings/:date',
      requireUser,
      validate('param', dateParam),
      validate('json', weighingRequestSchema),
      (c) => {
        const userId = c.var.user.id;
        const { date } = c.req.valid('param');
        const { weightKg } = c.req.valid('json');
        // Today + 1: the device may already be in tomorrow (ADR-0016 §3).
        const code = weighingDateError(
          date,
          addDays(serverToday(), 1),
          readProfile(db, userId).profile.birthDate,
        );
        if (code)
          throw new ApiError(400, 'validation_failed', [
            { path: ['date'], code },
          ]);
        db.transaction(() => {
          putWeighing(db, userId, date, weightKg);
          syncProfileWeight(db, userId);
        })();
        return c.json({
          weighing: { date, weightKg },
          profile: readProfile(db, userId),
        } satisfies WeighingPutResponse);
      },
    )
    .delete(
      '/weighings/:date',
      requireUser,
      validate('param', dateParam),
      (c) => {
        const userId = c.var.user.id;
        const { date } = c.req.valid('param');
        db.transaction(() => {
          deleteWeighing(db, userId, date);
          syncProfileWeight(db, userId);
        })();
        return c.json({
          profile: readProfile(db, userId),
        } satisfies WeighingDeleteResponse);
      },
    );
}
