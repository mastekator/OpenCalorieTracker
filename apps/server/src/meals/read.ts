import type { Database } from 'better-sqlite3';
import type { Meal, MealItem } from '@oct/shared';
import { CHOICE_JOIN, resolveIllustration } from '../illustrations/routes.js';

export interface MealRow {
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

/** Meals matching `where` (over `meals m`) by `eaten_at`: one query for meals, one for their dishes. */
function selectMeals(db: Database, where: string, ...params: unknown[]) {
  const rows = db
    .prepare(`SELECT * FROM meals m WHERE ${where} ORDER BY eaten_at, id`)
    .all(...params) as MealRow[];
  const items = new Map<number, MealItem[]>();
  for (const { mealId, manual, ...i } of db
    .prepare(
      `SELECT i.meal_id AS mealId, i.name, i.grams, i.kcal, i.protein_g AS proteinG,
         i.fat_g AS fatG, i.carbs_g AS carbsG, i.source, i.ai_provider AS aiProvider,
         i.ai_model AS aiModel, i.confidence, i.illustration IS NOT NULL AS manual,
         COALESCE(i.illustration, c.illustration) AS illustration
       FROM meal_items i JOIN meals m ON m.id = i.meal_id ${CHOICE_JOIN}
       WHERE ${where} ORDER BY i.meal_id, i.position`,
    )
    .all(...params) as (Omit<MealItem, 'illustration'> & {
    mealId: number;
    manual: number;
    illustration: string | null;
  })[]) {
    const list = items.get(mealId) ?? [];
    list.push({
      ...i,
      illustration: resolveIllustration(i.illustration, i.name),
      illustrationManual: !!manual,
    });
    items.set(mealId, list);
  }
  return rows.map((m): Meal => {
    const list = items.get(m.id) ?? [];
    const sum = (k: 'kcal' | 'proteinG' | 'fatG' | 'carbsG') =>
      list.reduce((s, i) => s + i[k], 0);
    return {
      id: m.id,
      clientId: m.client_id,
      eatenAt: new Date(m.eaten_at).toISOString(),
      tzOffsetMin: m.tz_offset_min,
      localDate: m.local_date,
      mealType: m.meal_type,
      photo: m.photo_id ? { id: m.photo_id, full: !!m.photo_full } : null,
      recalcOffer: !!m.recalc_offer,
      items: list,
      kcal: sum('kcal'),
      proteinG: sum('proteinG'),
      fatG: sum('fatG'),
      carbsG: sum('carbsG'),
    };
  });
}

export const readMeal = (db: Database, id: number) =>
  selectMeals(db, 'm.id = ?', id)[0]!;

/** The user's meals with `local_date` in `from..to` inclusive, by `eaten_at`. */
export const readMeals = (
  db: Database,
  userId: number,
  from: string,
  to: string,
) =>
  selectMeals(
    db,
    'm.user_id = ? AND m.local_date BETWEEN ? AND ?',
    userId,
    from,
    to,
  );
