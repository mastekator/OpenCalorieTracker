import type { Database } from 'better-sqlite3';
import {
  nameKey,
  type Locale,
  type DishUnit,
  type MealType,
} from '@oct/shared';
import { bumpRev } from '../sync/rev.js';
import { csvRecords, readOct, type Draft } from './draft.js';

/** Dishes per transaction (ADR-0026 §5); the event loop gets a turn between batches. */
export const COMMIT_BATCH = 500;

export interface ImportMeal {
  localDate: string;
  eatenAt: number;
  tzOffsetMin: number;
  mealType: MealType;
  dishes: {
    name: string;
    grams: number;
    unit: DishUnit;
    kcal: number;
    proteinG: number;
    fatG: number;
    carbsG: number;
    illustration?: string;
  }[];
}

/**
 * The meals a draft writes. An OCT meal stays one meal as it was; CSV dishes are grouped by
 * day, time and meal type, and the local time (noon without one) is moved to UTC by `tzOffsetMin`.
 */
export async function draftMeals(
  draft: Draft,
  path: string,
  locale: Locale,
  tzOffsetMin: number,
): Promise<ImportMeal[]> {
  if (draft.source === 'oct')
    return (await readOct(path)).meals.map((m) => ({
      localDate: m.localDate,
      eatenAt: Date.parse(m.eatenAt),
      tzOffsetMin: m.tzOffsetMin,
      mealType: m.mealType,
      dishes: m.dishes,
    }));
  const meals = new Map<string, ImportMeal>();
  for await (const { record: r } of (await csvRecords(path, draft, locale))
    .rows) {
    if (typeof r === 'string') continue;
    const time = r.time ?? '12:00';
    const key = `${r.localDate} ${time} ${r.mealType}`;
    let meal = meals.get(key);
    if (!meal) {
      meal = {
        localDate: r.localDate,
        eatenAt:
          Date.parse(`${r.localDate}T${time}:00Z`) - tzOffsetMin * 60_000,
        tzOffsetMin,
        mealType: r.mealType,
        dishes: [],
      };
      meals.set(key, meal);
    }
    meal.dishes.push({ ...r, unit: 'g' });
  }
  return [...meals.values()];
}

/**
 * Writes the meals of import `importId` in batches of whole meals. `clientId = import:<id>:<n>`
 * makes a repeat (or a resumed crashed commit) write nothing twice. Returns the dishes the import holds.
 */
export async function commitMeals(
  db: Database,
  userId: number,
  importId: number,
  meals: ImportMeal[],
  includeDaysWithEntries: boolean,
): Promise<number> {
  // Taken once before writing, and without this import's own meals, so a batch never skips a day
  // an earlier batch (or an interrupted earlier commit) wrote.
  const daysWithEntries = new Set(
    db
      .prepare(
        'SELECT DISTINCT local_date FROM meals WHERE user_id = ? AND import_id IS NOT ?',
      )
      .pluck()
      .all(userId, importId) as string[],
  );
  const insertMeal = db.prepare(
    `INSERT INTO meals (user_id, client_id, eaten_at, tz_offset_min, local_date, meal_type,
       rev, edit_rev, import_id, logged_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, client_id) DO NOTHING RETURNING id`,
  );
  const insertItem = db.prepare(
    `INSERT INTO meal_items (meal_id, position, name, name_key, grams, unit, kcal, protein_g,
       fat_g, carbs_g, source, illustration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', ?)`,
  );
  // An import id can be reused after a delete; its new meals must not sit next to old tombstones.
  const untomb = db.prepare(
    'DELETE FROM meal_tombstones WHERE user_id = ? AND client_id = ?',
  );
  const write = db.transaction((batch: [number, ImportMeal][]) => {
    const now = Date.now();
    for (const [n, m] of batch) {
      const clientId = `import:${importId}:${n}`;
      const rev = bumpRev(db, userId);
      const id = insertMeal.pluck().get(
        userId,
        clientId,
        m.eatenAt,
        m.tzOffsetMin,
        m.localDate,
        m.mealType,
        rev,
        rev,
        importId,
        // Imported history was logged in its own time, not backfilled now (ADR-0032 §2).
        Math.min(m.eatenAt, now),
        now,
        now,
      ) as number | undefined;
      if (id === undefined) continue;
      m.dishes.forEach((d, i) =>
        insertItem.run(
          id,
          i,
          d.name,
          nameKey(d.name),
          d.grams,
          d.unit,
          d.kcal,
          d.proteinG,
          d.fatG,
          d.carbsG,
          d.illustration ?? null,
        ),
      );
      untomb.run(userId, clientId);
    }
  });

  let batch: [number, ImportMeal][] = [];
  let dishes = 0;
  for (const [n, m] of meals.entries()) {
    if (!includeDaysWithEntries && daysWithEntries.has(m.localDate)) continue;
    batch.push([n + 1, m]);
    dishes += m.dishes.length;
    if (dishes >= COMMIT_BATCH) {
      write(batch);
      batch = [];
      dishes = 0;
      await new Promise(setImmediate);
    }
  }
  write(batch);
  return db
    .prepare(
      'SELECT count(*) FROM meal_items i JOIN meals m ON m.id = i.meal_id WHERE m.import_id = ?',
    )
    .pluck()
    .get(importId) as number;
}
