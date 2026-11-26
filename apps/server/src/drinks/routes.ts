import { Hono } from 'hono';
import {
  addDays,
  BUILTIN_DRINKS,
  drinkEntryInputSchema,
  drinkInputSchema,
  entryFrom,
  waterGoalPutSchema,
  type Drink,
  type DrinkEntry,
  type DrinkInput,
  type DrinkSnapshot,
  type IllustrationId,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { serverToday } from '../profile/routes.js';
import { bumpRev } from '../sync/rev.js';

interface DrinkRow {
  id: number;
  name: string;
  illustration: IllustrationId;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  counts_water: 0 | 1;
  deleted: 0 | 1;
}

interface EntryRow {
  client_id: string;
  date: string;
  taken_at: number;
  drink_key: string | null;
  name: string | null;
  illustration: IllustrationId;
  ml: number;
  counts_water: 0 | 1;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  deleted: 0 | 1;
}

const toDrink = (r: DrinkRow): Drink => ({
  id: r.id,
  name: r.name,
  illustration: r.illustration,
  kcal: r.kcal,
  proteinG: r.protein_g,
  fatG: r.fat_g,
  carbsG: r.carbs_g,
  countsWater: r.counts_water === 1,
  deleted: r.deleted === 1,
});

export const toDrinkEntry = (r: EntryRow): DrinkEntry => ({
  clientId: r.client_id,
  date: r.date,
  takenAt: new Date(r.taken_at).toISOString(),
  drinkKey: r.drink_key,
  ...(r.name === null ? {} : { name: r.name }),
  illustration: r.illustration,
  ml: r.ml,
  countsWater: r.counts_water === 1,
  kcal: r.kcal,
  proteinG: r.protein_g,
  fatG: r.fat_g,
  carbsG: r.carbs_g,
  deleted: r.deleted === 1,
});

/** Today + 1: the device may already be in tomorrow (as weighings, ADR-0028 §3). */
const checkDate = (date: string) => {
  if (date > addDays(serverToday(), 1))
    throw new ApiError(400, 'validation_failed', [
      { path: ['date'], code: 'date_in_future' },
    ]);
};

const drinkCols = (d: DrinkInput) =>
  [
    d.name,
    d.illustration,
    d.kcal,
    d.proteinG,
    d.fatG,
    d.carbsG,
    +d.countsWater,
  ] as const;

/** The user's own drinks, water goal and drink entries (ADR-0028 §3); reads come through /api/sync. */
export function drinkRoutes({ db }: AppDeps) {
  const findDrink = (userId: number, id: string) =>
    db
      .prepare('SELECT * FROM drinks WHERE id = ? AND user_id = ?')
      .get(Number(id) || 0, userId) as DrinkRow | undefined;
  const findEntry = (userId: number, clientId: string) =>
    db
      .prepare(
        'SELECT * FROM drink_entries WHERE user_id = ? AND client_id = ?',
      )
      .get(userId, clientId) as EntryRow | undefined;

  /** The snapshot of a drink by key; a missing, deleted or another user's own drink → 404. */
  const snapshotOf = (
    userId: number,
    key: string,
    ml: number,
  ): DrinkSnapshot => {
    const builtin = BUILTIN_DRINKS.find((d) => d.key === key);
    if (builtin) return entryFrom(builtin, ml);
    const own = findDrink(userId, key.slice('custom:'.length));
    if (!own || own.deleted) throw new ApiError(404, 'not_found');
    return entryFrom(
      {
        name: own.name,
        illustration: own.illustration,
        per100: {
          kcal: own.kcal,
          proteinG: own.protein_g,
          fatG: own.fat_g,
          carbsG: own.carbs_g,
        },
        countsWater: own.counts_water === 1,
      },
      ml,
    );
  };

  return new Hono<AuthEnv>()
    .post('/drinks', requireUser, validate('json', drinkInputSchema), (c) => {
      const userId = c.var.user.id;
      const now = Date.now();
      const id = db.transaction(
        () =>
          db
            .prepare(
              `INSERT INTO drinks (user_id, name, illustration, kcal, protein_g, fat_g, carbs_g,
                 counts_water, rev, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              userId,
              ...drinkCols(c.req.valid('json')),
              bumpRev(db, userId),
              now,
              now,
            ).lastInsertRowid,
      )();
      return c.json(toDrink(findDrink(userId, String(id))!), 201);
    })
    .patch(
      '/drinks/:id',
      requireUser,
      validate('json', drinkInputSchema),
      (c) => {
        const userId = c.var.user.id;
        const drink = findDrink(userId, c.req.param('id'));
        if (!drink || drink.deleted) throw new ApiError(404, 'not_found');
        db.transaction(() =>
          db
            .prepare(
              `UPDATE drinks SET name = ?, illustration = ?, kcal = ?, protein_g = ?, fat_g = ?,
               carbs_g = ?, counts_water = ?, rev = ?, updated_at = ? WHERE id = ?`,
            )
            .run(
              ...drinkCols(c.req.valid('json')),
              bumpRev(db, userId),
              Date.now(),
              drink.id,
            ),
        )();
        return c.json(toDrink(findDrink(userId, String(drink.id))!));
      },
    )
    .delete('/drinks/:id', requireUser, (c) => {
      const userId = c.var.user.id;
      const drink = findDrink(userId, c.req.param('id'));
      if (!drink) throw new ApiError(404, 'not_found');
      // Idempotent: an already deleted one is left as is, with no new rev.
      if (!drink.deleted)
        db.transaction(() =>
          db
            .prepare(
              'UPDATE drinks SET deleted = 1, rev = ?, updated_at = ? WHERE id = ?',
            )
            .run(bumpRev(db, userId), Date.now(), drink.id),
        )();
      return c.body(null, 204);
    })
    .put(
      '/water/goal',
      requireUser,
      validate('json', waterGoalPutSchema),
      (c) => {
        const userId = c.var.user.id;
        const { date, goalMl } = c.req.valid('json');
        checkDate(date);
        // A second change on the same day replaces that day's row (ADR-0028 §1).
        db.transaction(() =>
          db
            .prepare(
              `INSERT INTO water_goals (user_id, from_date, goal_ml, rev) VALUES (?, ?, ?, ?)
             ON CONFLICT (user_id, from_date) DO UPDATE SET goal_ml = excluded.goal_ml, rev = excluded.rev`,
            )
            .run(userId, date, goalMl, bumpRev(db, userId)),
        )();
        return c.body(null, 204);
      },
    )
    .post(
      '/drink-entries',
      requireUser,
      validate('json', drinkEntryInputSchema),
      (c) => {
        const userId = c.var.user.id;
        const input = c.req.valid('json');
        // A replay of the queued operation gets the entry it already made.
        const existing = findEntry(userId, input.clientId);
        if (existing) return c.json(toDrinkEntry(existing), 200);
        checkDate(input.date);
        const snap: DrinkSnapshot =
          'drinkKey' in input
            ? snapshotOf(userId, input.drinkKey, input.ml)
            : { ...input.photo, ml: input.ml };
        db.transaction(() =>
          db
            .prepare(
              `INSERT INTO drink_entries (user_id, client_id, date, taken_at, drink_key, name,
               illustration, ml, counts_water, kcal, protein_g, fat_g, carbs_g, rev)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              userId,
              input.clientId,
              input.date,
              Date.parse(input.takenAt),
              'drinkKey' in input ? input.drinkKey : null,
              snap.name ?? null,
              snap.illustration,
              snap.ml,
              +snap.countsWater,
              snap.kcal,
              snap.proteinG,
              snap.fatG,
              snap.carbsG,
              bumpRev(db, userId),
            ),
        )();
        return c.json(toDrinkEntry(findEntry(userId, input.clientId)!), 201);
      },
    )
    .delete('/drink-entries/:clientId', requireUser, (c) => {
      const userId = c.var.user.id;
      const entry = findEntry(userId, c.req.param('clientId'));
      if (!entry) throw new ApiError(404, 'not_found');
      if (!entry.deleted)
        db.transaction(() =>
          db
            .prepare(
              'UPDATE drink_entries SET deleted = 1, rev = ? WHERE user_id = ? AND client_id = ?',
            )
            .run(bumpRev(db, userId), userId, entry.client_id),
        )();
      return c.body(null, 204);
    });
}
