import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Hono } from 'hono';
import {
  addDays,
  mealInputSchema,
  mealPatchSchema,
  nameKey,
  type Meal,
  type MealItemInput,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { getAiSettings } from '../ai/settings.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { photoPath } from '../photos/store.js';
import { bumpRev } from '../sync/rev.js';

const DAY_MS = 86_400_000;
const FUTURE_SLACK_MS = 5 * 60_000;

interface MealRow {
  id: number;
  client_id: string;
  eaten_at: number;
  tz_offset_min: number;
  local_date: string;
  meal_type: Meal['mealType'];
  photo_id: string | null;
  photo_full: number;
  photo_expires_at: number | null;
  recalc_offer: number;
}

/**
 * `eatenAt` as Unix ms, after checking it is not in the future and that `localDate` is the
 * device's date of it, or the day before for 00:00-03:59 ("Вчера", AC-0.1a). The server never
 * derives the day from its own TZ (E-0.1).
 */
export function checkWhen(
  eatenAt: string,
  tzOffsetMin: number,
  localDate: string,
  now = Date.now(),
): number {
  const ms = Date.parse(eatenAt);
  const local = new Date(ms + tzOffsetMin * 60_000);
  const date = local.toISOString().slice(0, 10);
  const ok =
    localDate === date ||
    (local.getUTCHours() < 4 && localDate === addDays(date, -1));
  if (ms > now + FUTURE_SLACK_MS || !ok)
    throw new ApiError(400, 'validation_failed', [
      {
        path: [ms > now + FUTURE_SLACK_MS ? 'eatenAt' : 'localDate'],
        code: 'custom',
      },
    ]);
  return ms;
}

/** Create, read, edit and delete one's own meals (ADR-0009 "API", ADR-0010 for deletion). */
export function mealRoutes({ config, db }: AppDeps) {
  const findMeal = (userId: number, id: string) =>
    /^\d+$/.test(id)
      ? (db
          .prepare('SELECT * FROM meals WHERE id = ? AND user_id = ?')
          .get(Number(id), userId) as MealRow | undefined)
      : undefined;

  const readMeal = (id: number): Meal => {
    const m = db.prepare('SELECT * FROM meals WHERE id = ?').get(id) as MealRow;
    const items = (
      db
        .prepare(
          `SELECT name, grams, kcal, protein_g AS proteinG, fat_g AS fatG, carbs_g AS carbsG,
             source, ai_provider AS aiProvider, ai_model AS aiModel, confidence
           FROM meal_items WHERE meal_id = ? ORDER BY position`,
        )
        .all(id) as Omit<Meal['items'][number], 'illustration'>[]
    ).map((i) => ({ ...i, illustration: null }));
    const sum = (k: 'kcal' | 'proteinG' | 'fatG' | 'carbsG') =>
      items.reduce((s, i) => s + i[k], 0);
    return {
      id: m.id,
      clientId: m.client_id,
      eatenAt: new Date(m.eaten_at).toISOString(),
      tzOffsetMin: m.tz_offset_min,
      localDate: m.local_date,
      mealType: m.meal_type,
      photo: m.photo_id ? { id: m.photo_id, full: !!m.photo_full } : null,
      recalcOffer: !!m.recalc_offer,
      items,
      kcal: sum('kcal'),
      proteinG: sum('proteinG'),
      fatG: sum('fatG'),
      carbsG: sum('carbsG'),
    };
  };

  const insertItems = (mealId: number, items: MealItemInput[]) => {
    // Provider and model come from the server's current settings, never from the client (AC-4.1).
    const ai = getAiSettings(config);
    const insert = db.prepare(
      `INSERT INTO meal_items (meal_id, position, name, name_key, grams, kcal, protein_g, fat_g,
         carbs_g, source, ai_provider, ai_model, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    items.forEach((i, pos) => {
      const isAi = i.source === 'ai';
      insert.run(
        mealId,
        pos,
        i.name,
        nameKey(i.name),
        i.grams,
        i.kcal,
        i.proteinG,
        i.fatG,
        i.carbsG,
        i.source,
        isAi ? (ai?.provider ?? null) : null,
        isAi ? (ai?.model ?? null) : null,
        i.confidence ?? null,
      );
    });
  };

  const removePhoto = (
    userId: number,
    photoId: string,
    sizes = ['full', 'preview'] as const,
  ) =>
    Promise.all(
      sizes.map((s) => {
        const path = photoPath(config.dataDir, userId, photoId, s);
        return path && rm(path, { force: true });
      }),
    );

  return new Hono<AuthEnv>()
    .post(
      '/meals',
      requireUser,
      validate('json', mealInputSchema),
      async (c) => {
        const userId = c.var.user.id;
        const input = c.req.valid('json');
        const result = db.transaction(() => {
          // A repeat (double tap, offline queue) returns the saved meal before any other check,
          // so a retry with a photo is not refused as photo_in_use (E-4.1).
          const existing = db
            .prepare('SELECT id FROM meals WHERE user_id = ? AND client_id = ?')
            .pluck()
            .get(userId, input.clientId) as number | undefined;
          if (existing !== undefined)
            return { id: existing, created: false, dropFull: false };

          const eatenAt = checkWhen(
            input.eatenAt,
            input.tzOffsetMin,
            input.localDate,
          );
          let full = 0;
          let expiresAt: number | null = null;
          if (input.photoId !== undefined) {
            const preview = photoPath(
              config.dataDir,
              userId,
              input.photoId,
              'preview',
            );
            if (!preview || !existsSync(preview))
              throw new ApiError(404, 'not_found');
            if (
              db
                .prepare('SELECT 1 FROM meals WHERE photo_id = ?')
                .get(input.photoId)
            )
              throw new ApiError(409, 'photo_in_use');
            const days = db
              .prepare('SELECT photo_retention_days FROM users WHERE id = ?')
              .pluck()
              .get(userId) as number | null;
            // ADR-0008: 0 keeps only the preview, NULL keeps the full photo forever.
            full = days === 0 ? 0 : 1;
            expiresAt = days ? eatenAt + days * DAY_MS : null;
          }
          const now = Date.now();
          const id = db
            .prepare(
              `INSERT INTO meals (user_id, client_id, eaten_at, tz_offset_min, local_date, meal_type,
               photo_id, photo_full, photo_expires_at, recalc_offer, rev, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            )
            .pluck()
            .get(
              userId,
              input.clientId,
              eatenAt,
              input.tzOffsetMin,
              input.localDate,
              input.mealType,
              input.photoId ?? null,
              full,
              expiresAt,
              input.recalcOffer ? 1 : 0,
              bumpRev(db, userId),
              now,
              now,
            ) as number;
          insertItems(id, input.items);
          return {
            id,
            created: true,
            dropFull: input.photoId !== undefined && !full,
          };
        })();
        if (result.dropFull)
          await removePhoto(userId, input.photoId!, ['full']);
        return c.json(readMeal(result.id), result.created ? 201 : 200);
      },
    )
    .get('/meals/:id', requireUser, (c) => {
      const meal = findMeal(c.var.user.id, c.req.param('id'));
      if (!meal) throw new ApiError(404, 'not_found');
      return c.json(readMeal(meal.id));
    })
    .patch(
      '/meals/:id',
      requireUser,
      validate('json', mealPatchSchema),
      (c) => {
        const userId = c.var.user.id;
        const patch = c.req.valid('json');
        const meal = findMeal(userId, c.req.param('id'));
        if (!meal) throw new ApiError(404, 'not_found');
        db.transaction(() => {
          let eatenAt = meal.eaten_at;
          let expiresAt = meal.photo_expires_at;
          if ('eatenAt' in patch) {
            eatenAt = checkWhen(
              patch.eatenAt,
              patch.tzOffsetMin,
              patch.localDate,
            );
            // The retention period counts from when the meal was eaten.
            if (meal.photo_full && expiresAt !== null)
              expiresAt += eatenAt - meal.eaten_at;
          }
          db.prepare(
            `UPDATE meals SET eaten_at = ?, tz_offset_min = ?, local_date = ?, meal_type = ?,
             photo_expires_at = ?, recalc_offer = ?, rev = ?, updated_at = ? WHERE id = ?`,
          ).run(
            eatenAt,
            'eatenAt' in patch ? patch.tzOffsetMin : meal.tz_offset_min,
            'eatenAt' in patch ? patch.localDate : meal.local_date,
            patch.mealType ?? meal.meal_type,
            expiresAt,
            patch.recalcOffer === undefined
              ? meal.recalc_offer
              : Number(patch.recalcOffer),
            bumpRev(db, userId),
            Date.now(),
            meal.id,
          );
          if (patch.items) {
            db.prepare('DELETE FROM meal_items WHERE meal_id = ?').run(meal.id);
            insertItems(meal.id, patch.items);
          }
        })();
        return c.json(readMeal(meal.id));
      },
    )
    .delete('/meals/:id', requireUser, async (c) => {
      const userId = c.var.user.id;
      // Idempotent for the offline queue: missing, already deleted or another user's → 204, no change.
      // shortcut: no tombstone yet, OCT-75 adds it with /api/sync.
      const meal = findMeal(userId, c.req.param('id'));
      if (meal) {
        db.prepare('DELETE FROM meals WHERE id = ?').run(meal.id);
        // After the commit: a crash in between leaves orphan files for the cleanup job (OCT-52).
        if (meal.photo_id) await removePhoto(userId, meal.photo_id);
      }
      return c.body(null, 204);
    });
}
