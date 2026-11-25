import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import {
  addDays,
  daysBetween,
  entryDay,
  mealItemInputSchema,
  mealTypeAt,
  mealTypeSchema,
  remainingOf,
  sumDay,
  type DishSource,
  type Meal,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { readSettings } from '../account/routes.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { readMeals } from '../meals/read.js';
import { mealStore } from '../meals/routes.js';
import { getDailyNorm, readProfile } from '../profile/norm.js';
import { userTimeZone, userToday } from '../profile/routes.js';

/** Longest periods per request (ADR-0027 §2, E-9). */
export const MAX_DAYS = 366;
export const MAX_MEAL_DAYS = 31;

const dayQuery = z.object({ date: z.iso.date().optional() });
const periodQuery = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine((q) => q.from <= q.to, { path: ['to'] });

const checkLength = (from: string, to: string, max: number) => {
  if (daysBetween(from, to) + 1 > max)
    throw new ApiError(400, 'period_too_long', { max });
};

// The internal API's rules for a dish (ADR-0027 §2); macros may be omitted.
const dish = mealItemInputSchema.shape;

export const apiMealSchema = z.object({
  clientId: z.uuid().optional(),
  eatenAt: z.iso.datetime({ offset: true }).optional(),
  mealType: mealTypeSchema.optional(),
  dishes: z
    .array(
      z.object({
        name: dish.name,
        grams: dish.grams,
        kcal: dish.kcal,
        proteinG: dish.proteinG.default(0),
        fatG: dish.fatG.default(0),
        carbsG: dish.carbsG.default(0),
      }),
    )
    .min(1)
    .max(50),
});

/** The day's totals as on the Today screen; `date` defaults to today in the user's zone (ADR-0027 §5). */
export function readDay(db: Database, userId: number, date?: string) {
  const day = date ?? userToday(db, userId);
  const eaten = sumDay(readMeals(db, userId, day, day));
  const norm = getDailyNorm(db, userId, day);
  return {
    date: day,
    eaten,
    norm,
    remaining: norm && remainingOf(norm, eaten),
  };
}

/** Totals per day of `from..to`, with the norm of today. */
export function readDays(
  db: Database,
  userId: number,
  from: string,
  to: string,
) {
  checkLength(from, to, MAX_DAYS);
  const meals = readMeals(db, userId, from, to);
  const days = Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => {
    const date = addDays(from, i);
    const ofDay = meals.filter((m) => m.localDate === date);
    return { date, eaten: sumDay(ofDay), meals: ofDay.length };
  });
  return {
    from,
    to,
    norm: getDailyNorm(db, userId, userToday(db, userId)),
    days,
  };
}

/** A meal without photos and the app's internal fields. */
const publicMeal = (m: Meal) => ({
  clientId: m.clientId,
  eatenAt: m.eatenAt,
  localDate: m.localDate,
  mealType: m.mealType,
  kcal: m.kcal,
  proteinG: m.proteinG,
  fatG: m.fatG,
  carbsG: m.carbsG,
  dishes: m.items.map((i) => ({
    name: i.name,
    grams: i.grams,
    unit: i.unit,
    kcal: i.kcal,
    proteinG: i.proteinG,
    fatG: i.fatG,
    carbsG: i.carbsG,
    source: i.source,
  })),
});

export function listMeals(
  db: Database,
  userId: number,
  from: string,
  to: string,
) {
  checkLength(from, to, MAX_MEAL_DAYS);
  return { from, to, meals: readMeals(db, userId, from, to).map(publicMeal) };
}

/** Profile, units, language and today's norm; never the email. */
export function readPublicProfile(db: Database, userId: number) {
  const { profile, manual } = readProfile(db, userId);
  const { units, locale } = readSettings(db, userId);
  return {
    profile,
    manual,
    units,
    locale,
    norm: getDailyNorm(db, userId, userToday(db, userId)),
  };
}

// Before validation: a read token learns nothing about the body rules.
const requireWrite = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.var.tokenScope !== 'write')
    throw new ApiError(403, 'insufficient_scope');
  await next();
});

/** Local wall time of `ms` in `timeZone` (undefined = the server's) as minutes east of UTC. */
const offsetMin = (ms: number, timeZone: string | undefined) => {
  const local = new Date(ms).toLocaleString('sv', { timeZone });
  return Math.round((Date.parse(`${local.replace(' ', 'T')}Z`) - ms) / 60_000);
};

/** The versioned API for tokens (ADR-0027 §2); `tokenAuth` sits on /api/v1/* in app.ts. */
export function publicApiRoutes(deps: AppDeps) {
  const { db } = deps;
  const { createMeal } = mealStore(deps);
  return new Hono<AuthEnv>()
    .get('/day', requireUser, validate('query', dayQuery), (c) =>
      c.json(readDay(db, c.var.user.id, c.req.valid('query').date)),
    )
    .get('/days', requireUser, validate('query', periodQuery), (c) => {
      const { from, to } = c.req.valid('query');
      return c.json(readDays(db, c.var.user.id, from, to));
    })
    .get('/meals', requireUser, validate('query', periodQuery), (c) => {
      const { from, to } = c.req.valid('query');
      return c.json(listMeals(db, c.var.user.id, from, to));
    })
    .get('/profile', requireUser, (c) =>
      c.json(readPublicProfile(db, c.var.user.id)),
    )
    .post(
      '/meals',
      requireUser,
      requireWrite,
      validate('json', apiMealSchema),
      async (c) => {
        const userId = c.var.user.id;
        const body = c.req.valid('json');
        const ms = body.eatenAt ? Date.parse(body.eatenAt) : Date.now();
        // The day and meal type come from the user's zone, as the device would give them.
        const tzOffsetMin = offsetMin(ms, userTimeZone(db, userId));
        const localHour = new Date(ms + tzOffsetMin * 60_000).getUTCHours();
        const { meal, created } = await createMeal(userId, {
          // Without a clientId every request is a new meal: no idempotency asked for.
          clientId: body.clientId ?? randomUUID(),
          eatenAt: new Date(ms).toISOString(),
          tzOffsetMin,
          localDate: entryDay(ms, tzOffsetMin, 'today'),
          mealType: body.mealType ?? mealTypeAt(localHour),
          // 'api' is stored (CHECK allows it) but is not a source the app's clients may send.
          items: body.dishes.map((d) => ({
            ...d,
            source: 'api' as DishSource,
          })),
        });
        return c.json(publicMeal(meal), created ? 201 : 200);
      },
    );
}
