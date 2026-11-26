import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import {
  applyMealPatch,
  entryDay,
  isSimilarDensity,
  mealInputSchema,
  mealPatchSchema,
  nameKey,
  previousDishesSchema,
  sameMealContent,
  type MealInput,
  type MealItemInput,
  type PreviousDish,
  type PreviousDishesResponse,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { photoPath, photoTaken, removePhoto } from '../photos/store.js';
import { bumpRev } from '../sync/rev.js';
import { CHOICE_JOIN, resolveIllustration } from '../illustrations/routes.js';
import { rememberer } from '../barcodes/remember.js';
import { readMeal, type MealRow } from './read.js';
import { deleteMeals } from './remove.js';
import { enqueueMealSaved } from '../webhooks/outbox.js';

const DAY_MS = 86_400_000;
const FUTURE_SLACK_MS = 5 * 60_000;
const HISTORY_DAYS = 90;

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
  const ok =
    localDate === entryDay(ms, tzOffsetMin, 'today') ||
    localDate === entryDay(ms, tzOffsetMin, 'yesterday');
  if (ms > now + FUTURE_SLACK_MS || !ok)
    throw new ApiError(400, 'validation_failed', [
      {
        path: [ms > now + FUTURE_SLACK_MS ? 'eatenAt' : 'localDate'],
        code: 'custom',
      },
    ]);
  return ms;
}

/** Meal writes shared by the internal API and /api/v1 (ADR-0027 §2). */
export function mealStore({
  config,
  db,
  ai,
}: Pick<AppDeps, 'config' | 'db' | 'ai'>) {
  const findMeal = (userId: number, id: string) =>
    /^\d+$/.test(id)
      ? (db
          .prepare('SELECT * FROM meals WHERE id = ? AND user_id = ?')
          .get(Number(id), userId) as MealRow | undefined)
      : undefined;

  const insertItems = (
    userId: number,
    mealId: number,
    items: MealItemInput[],
    // Provider and model come from the server, never from the client (AC-4.1).
    by: {
      provider: string | null;
      model: string | null;
    } | null = ai.forUser({ id: userId })?.settings ?? null,
  ) => {
    const insert = db.prepare(
      `INSERT INTO meal_items (meal_id, position, name, name_key, grams, unit, kcal, protein_g,
         fat_g, carbs_g, source, ai_provider, ai_model, confidence, illustration, recipe_id, barcode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const remember = rememberer(db);
    const now = Date.now();
    // Another user's or a deleted recipe (the meal waited in the offline queue) → no link, no error.
    const ownRecipe = db
      .prepare('SELECT id FROM recipes WHERE id = ? AND user_id = ?')
      .pluck();
    items.forEach((i, pos) => {
      const isAi = i.source === 'ai';
      insert.run(
        mealId,
        pos,
        i.name,
        nameKey(i.name),
        i.grams,
        i.unit ?? 'g',
        i.kcal,
        i.proteinG,
        i.fatG,
        i.carbsG,
        i.source,
        isAi ? (by?.provider ?? null) : null,
        isAi ? (by?.model ?? null) : null,
        i.confidence ?? null,
        i.illustration ?? null,
        i.recipeId === undefined
          ? null
          : ((ownRecipe.get(i.recipeId, userId) as number | undefined) ?? null),
        i.barcode ?? null,
      );
      remember(userId, i, now);
    });
  };

  /** Moves `last_logged_at` of the meal's recipes up to `eatenAt`, never back (ADR-0023 §5). */
  const touchRecipes = (userId: number, mealId: number, eatenAt: number) => {
    const ids = db
      .prepare(
        `SELECT DISTINCT r.id FROM meal_items i JOIN recipes r ON r.id = i.recipe_id
         WHERE i.meal_id = ? AND (r.last_logged_at IS NULL OR r.last_logged_at < ?)`,
      )
      .pluck()
      .all(mealId, eatenAt) as number[];
    const update = db.prepare(
      'UPDATE recipes SET last_logged_at = ?, rev = ? WHERE id = ?',
    );
    for (const id of ids) update.run(eatenAt, bumpRev(db, userId), id);
  };

  /**
   * Checks a photo about to be attached to a meal (ADR-0008) and returns its storage terms:
   * 0 days keeps only the preview, NULL keeps the full photo forever, else N days from `eatenAt`.
   */
  const photoTerms = (
    userId: number,
    photoId: string,
    eatenAt: number,
    mealHasPhoto = false,
  ) => {
    const preview = photoPath(config.dataDir, userId, photoId, 'preview');
    if (!preview || !existsSync(preview)) throw new ApiError(404, 'not_found');
    if (mealHasPhoto || photoTaken(db, photoId, null))
      throw new ApiError(409, 'photo_in_use');
    const days = db
      .prepare('SELECT photo_retention_days FROM users WHERE id = ?')
      .pluck()
      .get(userId) as number | null;
    return {
      full: days === 0 ? 0 : 1,
      expiresAt: days ? eatenAt + days * DAY_MS : null,
    };
  };

  /**
   * Saves a new meal; a repeat of `clientId` returns the saved one with `created: false`
   * before any other check (E-4.1).
   */
  const createMeal = async (userId: number, input: MealInput) => {
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
      const { full, expiresAt } =
        input.photoId === undefined
          ? { full: 0, expiresAt: null }
          : photoTerms(userId, input.photoId, eatenAt);
      const now = Date.now();
      const rev = bumpRev(db, userId);
      const id = db
        .prepare(
          `INSERT INTO meals (user_id, client_id, eaten_at, tz_offset_min, local_date, meal_type,
           photo_id, photo_full, photo_expires_at, recalc_offer, rev, edit_rev, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
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
          rev,
          rev,
          now,
          now,
        ) as number;
      insertItems(userId, id, input.items);
      touchRecipes(userId, id, eatenAt);
      enqueueMealSaved(db, config, userId, 'created', () => readMeal(db, id));
      // Re-created after a delete: the newer rev of the meal must not sit next to a tombstone.
      db.prepare(
        'DELETE FROM meal_tombstones WHERE user_id = ? AND client_id = ?',
      ).run(userId, input.clientId);
      return {
        id,
        created: true,
        dropFull: input.photoId !== undefined && !full,
      };
    })();
    if (result.dropFull)
      await removePhoto(config.dataDir, userId, input.photoId!, ['full']);
    return { meal: readMeal(db, result.id), created: result.created };
  };

  return { findMeal, insertItems, touchRecipes, photoTerms, createMeal };
}

/** Create, read, edit and delete one's own meals (ADR-0009 "API", ADR-0010 for deletion). */
export function mealRoutes(deps: AppDeps) {
  const { config, db } = deps;
  const { findMeal, insertItems, touchRecipes, photoTerms, createMeal } =
    mealStore(deps);

  return new Hono<AuthEnv>()
    .post(
      '/meals',
      requireUser,
      validate('json', mealInputSchema),
      async (c) => {
        const { meal, created } = await createMeal(
          c.var.user.id,
          c.req.valid('json'),
        );
        return c.json(meal, created ? 201 : 200);
      },
    )
    .get('/meals/:id', requireUser, (c) => {
      const meal = findMeal(c.var.user.id, c.req.param('id'));
      if (!meal) throw new ApiError(404, 'not_found');
      return c.json(readMeal(db, meal.id));
    })
    .patch(
      '/meals/:id',
      requireUser,
      validate('json', mealPatchSchema),
      async (c) => {
        const userId = c.var.user.id;
        const patch = c.req.valid('json');
        const meal = findMeal(userId, c.req.param('id'));
        if (!meal) throw new ApiError(404, 'not_found');
        // Made on an older version (ADR-0022 §2): a repeat of what is stored is fine, else a conflict.
        if (patch.baseRev !== undefined && patch.baseRev !== meal.edit_rev) {
          const current = readMeal(db, meal.id);
          if (sameMealContent(applyMealPatch(current, patch), current))
            return c.json(current);
          throw new ApiError(409, 'edit_conflict', { meal: current });
        }
        // Attaching a photo to a saved meal (ADR-0009); a repeat of the same id changes nothing.
        const attach =
          patch.photoId !== undefined && patch.photoId !== meal.photo_id
            ? patch.photoId
            : undefined;
        const dropFull = db.transaction(() => {
          // Same rule as account settings: clamp to server time, an older offline edit loses.
          const now = Date.now();
          const at = Math.min(patch.editedAt ?? now, now);
          const stored = meal.edited_at;
          // With baseRev the revision decides, not the device clock.
          if (
            patch.baseRev === undefined &&
            stored !== null &&
            stored <= now &&
            at < stored
          )
            return false;
          const rev = bumpRev(db, userId);
          let eatenAt = meal.eaten_at;
          let expiresAt = meal.photo_expires_at;
          let full = meal.photo_full;
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
          // After the eatenAt change: a new photo's period counts once, from the new time.
          if (attach !== undefined)
            ({ full, expiresAt } = photoTerms(
              userId,
              attach,
              eatenAt,
              meal.photo_id !== null,
            ));
          db.prepare(
            `UPDATE meals SET eaten_at = ?, tz_offset_min = ?, local_date = ?, meal_type = ?,
             photo_id = ?, photo_full = ?, photo_expires_at = ?, recalc_offer = ?, rev = ?,
             edit_rev = ?, edited_at = ?, updated_at = ?
             WHERE id = ?`,
          ).run(
            eatenAt,
            'eatenAt' in patch ? patch.tzOffsetMin : meal.tz_offset_min,
            'eatenAt' in patch ? patch.localDate : meal.local_date,
            patch.mealType ?? meal.meal_type,
            attach ?? meal.photo_id,
            full,
            expiresAt,
            patch.recalcOffer === undefined
              ? meal.recalc_offer
              : Number(patch.recalcOffer),
            rev,
            rev,
            at,
            now,
            meal.id,
          );
          if (patch.items) {
            // An edit keeps the model that recognized the photo, even if the server's AI changed
            // since; a recalculation (items with the offer cleared) is the current model's (AC-10.10).
            const recognizedBy =
              patch.recalcOffer === false
                ? undefined
                : (db
                    .prepare(
                      `SELECT ai_provider AS provider, ai_model AS model FROM meal_items
                 WHERE meal_id = ? AND source = 'ai' LIMIT 1`,
                    )
                    .get(meal.id) as
                    | { provider: string | null; model: string | null }
                    | undefined);
            db.prepare('DELETE FROM meal_items WHERE meal_id = ?').run(meal.id);
            insertItems(userId, meal.id, patch.items, recognizedBy);
          }
          touchRecipes(userId, meal.id, eatenAt);
          enqueueMealSaved(db, config, userId, 'updated', () =>
            readMeal(db, meal.id),
          );
          return attach !== undefined && !full;
        })();
        if (dropFull)
          await removePhoto(config.dataDir, userId, attach!, ['full']);
        return c.json(readMeal(db, meal.id));
      },
    )
    .post(
      '/dishes/previous',
      requireUser,
      validate('json', previousDishesSchema),
      (c) => {
        // Newest first; a daily dish gives ~90 rows, so density is filtered in JS (ADR-0009).
        const candidates = db.prepare(
          `SELECT m.id AS mealId, m.eaten_at AS eatenAt, i.grams, i.unit, i.kcal, i.protein_g AS proteinG,
             i.fat_g AS fatG, i.carbs_g AS carbsG, i.name,
             COALESCE(i.illustration, c.illustration) AS illustration
           FROM meal_items i JOIN meals m ON m.id = i.meal_id ${CHOICE_JOIN}
           WHERE m.user_id = ? AND i.name_key = ? AND m.eaten_at >= ?
           ORDER BY m.eaten_at DESC, m.id DESC, i.position`,
        );
        const since = Date.now() - HISTORY_DAYS * DAY_MS;
        const result: PreviousDishesResponse = c.req
          .valid('json')
          .dishes.map(({ name, kcalPer100 }) => {
            const rows = candidates.all(
              c.var.user.id,
              nameKey(name),
              since,
            ) as (Omit<PreviousDish, 'eatenAt' | 'illustration'> & {
              eatenAt: number;
              name: string;
              illustration: string | null;
            })[];
            const hit = rows.find(
              (r) =>
                kcalPer100 === undefined ||
                isSimilarDensity((r.kcal / r.grams) * 100, kcalPer100),
            );
            if (!hit) return null;
            const { name: dishName, ...dish } = hit;
            return {
              ...dish,
              eatenAt: new Date(hit.eatenAt).toISOString(),
              illustration: resolveIllustration(hit.illustration, dishName),
            };
          });
        return c.json(result);
      },
    )
    .delete('/meals/:id', requireUser, async (c) => {
      const userId = c.var.user.id;
      // Idempotent for the offline queue: missing, already deleted or another user's → 204, no change.
      const meal = findMeal(userId, c.req.param('id'));
      if (meal) await deleteMeals(db, config.dataDir, userId, [meal], config);
      return c.body(null, 204);
    });
}
