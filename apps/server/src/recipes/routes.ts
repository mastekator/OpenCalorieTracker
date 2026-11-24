import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Hono } from 'hono';
import {
  nameKey,
  recipeInputSchema,
  recipeUpdateSchema,
  type RecipeInput,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { rememberer } from '../barcodes/remember.js';
import { photoPath, photoTaken } from '../photos/store.js';
import { bumpRev } from '../sync/rev.js';
import { readRecipe } from './read.js';

/** Create, replace and delete one's own recipes, online only (ADR-0023 §3); reads go through sync. */
export function recipeRoutes({ config, db }: AppDeps) {
  const findRecipe = (userId: number, id: string) =>
    /^\d+$/.test(id)
      ? (db
          .prepare('SELECT id FROM recipes WHERE id = ? AND user_id = ?')
          .pluck()
          .get(Number(id), userId) as number | undefined)
      : undefined;

  /** Photo ids of the recipe and its steps. */
  const photosOf = (recipeId: number) =>
    db
      .prepare(
        `SELECT photo_id FROM recipes WHERE id = ? AND photo_id IS NOT NULL
         UNION ALL SELECT photo_id FROM recipe_steps WHERE recipe_id = ? AND photo_id IS NOT NULL`,
      )
      .pluck()
      .all(recipeId, recipeId) as string[];

  /** Each photo must be the user's upload, used once in the input and free of other owners. */
  const checkPhotos = (
    userId: number,
    input: RecipeInput,
    recipeId: number | null,
  ) => {
    const wanted: [string, (string | number)[]][] = [];
    if (input.photoId !== null) wanted.push([input.photoId, ['photoId']]);
    input.steps.forEach((s, i) => {
      if (s.photoId !== null) wanted.push([s.photoId, ['steps', i, 'photoId']]);
    });
    const seen = new Set<string>();
    for (const [id, path] of wanted) {
      const preview = photoPath(config.dataDir, userId, id, 'preview');
      if (
        seen.has(id) ||
        !preview ||
        !existsSync(preview) ||
        photoTaken(db, id, recipeId)
      )
        throw new ApiError(400, 'validation_failed', [
          { path, code: 'custom' },
        ]);
      seen.add(id);
    }
  };

  /**
   * Replaces the recipe's ingredients and steps; steps go first so a photo can move between them.
   * Ingredients' barcode, pack and edible choice are remembered like a meal's (ADR-0040 §2).
   */
  const write = (userId: number, recipeId: number, input: RecipeInput) => {
    db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(
      recipeId,
    );
    const ingredient = db.prepare(
      `INSERT INTO recipe_ingredients (recipe_id, position, name, grams, unit, kcal, protein_g,
         fat_g, carbs_g, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const remember = rememberer(db);
    const now = Date.now();
    input.ingredients.forEach((i, pos) => {
      ingredient.run(
        recipeId,
        pos,
        i.name,
        i.grams,
        i.unit ?? 'g',
        i.kcal,
        i.proteinG,
        i.fatG,
        i.carbsG,
        i.source,
      );
      remember(userId, i, now);
    });
    const step = db.prepare(
      'INSERT INTO recipe_steps (recipe_id, position, text, photo_id) VALUES (?, ?, ?, ?)',
    );
    input.steps.forEach((s, pos) => step.run(recipeId, pos, s.text, s.photoId));
  };

  /** The five per-100-g columns; all null for a recipe with ingredients. */
  const per100Cols = ({ per100: n, servingG }: RecipeInput) => [
    n?.kcal ?? null,
    n?.proteinG ?? null,
    n?.fatG ?? null,
    n?.carbsG ?? null,
    servingG,
  ];

  const removePhotos = (userId: number, ids: string[]) =>
    Promise.all(
      ids.flatMap((id) =>
        (['full', 'preview'] as const).map((s) => {
          const path = photoPath(config.dataDir, userId, id, s);
          return path && rm(path, { force: true });
        }),
      ),
    );

  return new Hono<AuthEnv>()
    .post('/recipes', requireUser, validate('json', recipeInputSchema), (c) => {
      const userId = c.var.user.id;
      const input = c.req.valid('json');
      const id = db.transaction(() => {
        checkPhotos(userId, input, null);
        const now = Date.now();
        const id = db
          .prepare(
            `INSERT INTO recipes (user_id, name, name_key, cooked_g, servings, note, photo_id,
                 per100_kcal, per100_protein_g, per100_fat_g, per100_carbs_g, serving_g, rev,
                 created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          )
          .pluck()
          .get(
            userId,
            input.name,
            nameKey(input.name),
            input.cookedG,
            input.servings,
            input.note || null,
            input.photoId,
            ...per100Cols(input),
            bumpRev(db, userId),
            now,
            now,
          ) as number;
        write(userId, id, input);
        return id;
      })();
      return c.json(readRecipe(db, id), 201);
    })
    .put(
      '/recipes/:id',
      requireUser,
      validate('json', recipeUpdateSchema),
      async (c) => {
        const userId = c.var.user.id;
        const input = c.req.valid('json');
        const id = findRecipe(userId, c.req.param('id'));
        if (id === undefined) throw new ApiError(404, 'not_found');
        const dropped = db.transaction(() => {
          // Edited from an older version: replacing would drop the newer edits and their photos.
          const updatedAt = db
            .prepare('SELECT updated_at FROM recipes WHERE id = ?')
            .pluck()
            .get(id) as number;
          if (updatedAt !== Date.parse(input.updatedAt))
            throw new ApiError(409, 'recipe_changed');
          checkPhotos(userId, input, id);
          const before = photosOf(id);
          db.prepare('DELETE FROM recipe_steps WHERE recipe_id = ?').run(id);
          db.prepare(
            `UPDATE recipes SET name = ?, name_key = ?, cooked_g = ?, servings = ?, note = ?,
               photo_id = ?, per100_kcal = ?, per100_protein_g = ?, per100_fat_g = ?,
               per100_carbs_g = ?, serving_g = ?, rev = ?, updated_at = ? WHERE id = ?`,
          ).run(
            input.name,
            nameKey(input.name),
            input.cookedG,
            input.servings,
            input.note || null,
            input.photoId,
            ...per100Cols(input),
            bumpRev(db, userId),
            // Strictly newer, so two saves in one millisecond still tell versions apart.
            Math.max(Date.now(), updatedAt + 1),
            id,
          );
          write(userId, id, input);
          const after = new Set(photosOf(id));
          return before.filter((p) => !after.has(p));
        })();
        // After the commit: a crash in between leaves orphan files for the sweep.
        await removePhotos(userId, dropped);
        return c.json(readRecipe(db, id));
      },
    )
    .delete('/recipes/:id', requireUser, async (c) => {
      const userId = c.var.user.id;
      // Idempotent: missing, already deleted or another user's → 204 with no change and no tombstone.
      const id = findRecipe(userId, c.req.param('id'));
      if (id !== undefined) {
        const photos = db.transaction(() => {
          const photos = photosOf(id);
          db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
          db.prepare(
            'INSERT INTO recipe_tombstones (user_id, recipe_id, rev) VALUES (?, ?, ?)',
          ).run(userId, id, bumpRev(db, userId));
          return photos;
        })();
        await removePhotos(userId, photos);
      }
      return c.body(null, 204);
    });
}
