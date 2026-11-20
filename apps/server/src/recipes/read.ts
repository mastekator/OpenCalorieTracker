import type { Database } from 'better-sqlite3';
import type { Recipe } from '@oct/shared';

interface RecipeRow {
  id: number;
  name: string;
  cooked_g: number | null;
  servings: number | null;
  note: string | null;
  photo_id: string | null;
  per100_kcal: number | null;
  per100_protein_g: number | null;
  per100_fat_g: number | null;
  per100_carbs_g: number | null;
  serving_g: number | null;
  last_logged_at: number | null;
  updated_at: number;
}

/** Recipes matching `where` (over `recipes r`): one query each for recipes, ingredients and steps. */
function selectRecipes(db: Database, where: string, ...params: unknown[]) {
  const rows = db
    .prepare(`SELECT * FROM recipes r WHERE ${where} ORDER BY r.rev`)
    .all(...params) as RecipeRow[];
  const group = <T extends { recipeId: number }>(sql: string) => {
    const by = new Map<number, Omit<T, 'recipeId'>[]>();
    for (const { recipeId, ...x } of db
      .prepare(sql.replace('$WHERE', where))
      .all(...params) as T[])
      by.set(recipeId, [...(by.get(recipeId) ?? []), x]);
    return by;
  };
  const ingredients = group<
    Recipe['ingredients'][number] & { recipeId: number }
  >(
    `SELECT i.recipe_id AS recipeId, i.name, i.grams, i.kcal, i.protein_g AS proteinG,
       i.fat_g AS fatG, i.carbs_g AS carbsG, i.source
     FROM recipe_ingredients i JOIN recipes r ON r.id = i.recipe_id
     WHERE $WHERE ORDER BY i.recipe_id, i.position`,
  );
  const steps = group<Recipe['steps'][number] & { recipeId: number }>(
    `SELECT s.recipe_id AS recipeId, s.text, s.photo_id AS photoId
     FROM recipe_steps s JOIN recipes r ON r.id = s.recipe_id
     WHERE $WHERE ORDER BY s.recipe_id, s.position`,
  );
  return rows.map((r): Recipe => ({
    id: r.id,
    name: r.name,
    cookedG: r.cooked_g,
    servings: r.servings,
    note: r.note,
    photoId: r.photo_id,
    ingredients: ingredients.get(r.id) ?? [],
    steps: steps.get(r.id) ?? [],
    // The mode is set by per100_kcal alone (ADR-0035 §1).
    per100:
      r.per100_kcal === null
        ? null
        : {
            kcal: r.per100_kcal,
            proteinG: r.per100_protein_g ?? 0,
            fatG: r.per100_fat_g ?? 0,
            carbsG: r.per100_carbs_g ?? 0,
          },
    servingG: r.serving_g,
    lastLoggedAt:
      r.last_logged_at === null
        ? null
        : new Date(r.last_logged_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

export const readRecipe = (db: Database, id: number) =>
  selectRecipes(db, 'r.id = ?', id)[0]!;

/** The user's recipes with `rev` in `(since, upTo]`, by `rev` (ADR-0011 §3). */
export const readRecipesByRev = (
  db: Database,
  userId: number,
  since: number,
  upTo: number,
) =>
  selectRecipes(
    db,
    'r.user_id = ? AND r.rev > ? AND r.rev <= ?',
    userId,
    since,
    upTo,
  );

/** Names sent to the model for recipe options: last logged first, at most 100 (ADR-0035 §4). */
export const recipeNames = (db: Database, userId: number) =>
  db
    .prepare(
      `SELECT id, name FROM recipes WHERE user_id = ?
       ORDER BY last_logged_at IS NULL, last_logged_at DESC, updated_at DESC LIMIT 100`,
    )
    .all(userId) as { id: number; name: string }[];
