import { Hono } from 'hono';
import { z } from 'zod';
import {
  addDays,
  daysBetween,
  isPeriod,
  remainingOf,
  sumDay,
  summarize,
  type DayResponse,
  type SummaryResponse,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { validate } from '../http/validate.js';
import { readMeals } from '../meals/read.js';
import { getDailyNorm } from '../profile/norm.js';

const dayParam = z.object({ date: z.iso.date() });
const summaryQuery = z
  .object({ from: z.iso.date(), to: z.iso.date(), today: z.iso.date() })
  .refine((q) => isPeriod(q.from, q.to), { path: ['to'] });

/** A day and a week or month of the diary, totals computed on read (ADR-0010). */
export function diaryRoutes({ db }: AppDeps) {
  return new Hono<AuthEnv>()
    .get('/days/:date', requireUser, validate('param', dayParam), (c) => {
      const userId = c.var.user.id;
      const { date } = c.req.valid('param');
      const meals = readMeals(db, userId, date, date);
      const total = sumDay(meals);
      const norm = getDailyNorm(db, userId, date);
      return c.json({
        date,
        meals,
        total,
        remaining: norm && remainingOf(norm, total),
        norm,
      } satisfies DayResponse);
    })
    .get('/summary', requireUser, validate('query', summaryQuery), (c) => {
      const userId = c.var.user.id;
      const { from, to, today } = c.req.valid('query');
      const meals = readMeals(db, userId, from, to);
      const days = Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => {
        const date = addDays(from, i);
        const ofDay = meals.filter((m) => m.localDate === date);
        return { date, ...sumDay(ofDay), meals: ofDay.length };
      });
      const norm = getDailyNorm(db, userId, today);
      return c.json({
        from,
        to,
        days,
        norm,
        ...summarize(days, norm, today),
      } satisfies SummaryResponse);
    });
}
