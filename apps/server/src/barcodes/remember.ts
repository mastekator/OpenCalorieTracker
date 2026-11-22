import type { Database } from 'better-sqlite3';
import type { DishUnit, EdibleChoice, PackPrefs } from '@oct/shared';

/** What a meal dish or a recipe ingredient teaches the server about the user's products. */
export interface RememberedItem {
  name: string;
  grams: number;
  unit?: DishUnit;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  source: string;
  barcode?: string;
  pack?: PackPrefs;
  edible?: EdibleChoice;
}

/**
 * Prepares the statements once and returns `rememberItem(userId, item, now)` (ADR-0040 §2):
 * the user's own product, the pack choice and the edible share, for meals and recipes alike.
 */
export function rememberer(db: Database) {
  // The user's own product, per 100 g or ml of the dish's unit (ADR-0034 §6, ADR-0038 §2): only values the user typed in are remembered.
  const product = db.prepare(
    `INSERT INTO user_products (user_id, code, name, kcal_100, protein_100, fat_100, carbs_100,
       per, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, code) DO UPDATE SET name = excluded.name,
       kcal_100 = excluded.kcal_100, protein_100 = excluded.protein_100,
       fat_100 = excluded.fat_100, carbs_100 = excluded.carbs_100, per = excluded.per,
       updated_at = excluded.updated_at`,
  );
  // Fields the client did not send keep their stored value; mode and value go as a pair.
  const prefs = db.prepare(
    `INSERT INTO product_prefs (user_id, code, pack_g, pieces, amount_mode, amount_value, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, code) DO UPDATE SET
       pack_g = COALESCE(excluded.pack_g, pack_g),
       pieces = COALESCE(excluded.pieces, pieces),
       amount_mode = COALESCE(excluded.amount_mode, amount_mode),
       amount_value = COALESCE(excluded.amount_value, amount_value),
       updated_at = excluded.updated_at`,
  );
  const edible = db.prepare(
    `INSERT INTO edible_prefs (user_id, key, pct, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, key) DO UPDATE SET pct = excluded.pct, updated_at = excluded.updated_at`,
  );
  const per100 = (v: number, g: number) => Math.round((v * 1000) / g) / 10;
  return (userId: number, i: RememberedItem, now: number) => {
    if (i.barcode && i.pack)
      prefs.run(
        userId,
        i.barcode,
        i.pack.packG ?? null,
        i.pack.pieces ?? null,
        i.pack.amount?.mode ?? null,
        i.pack.amount?.value ?? null,
        now,
      );
    if (i.edible) edible.run(userId, i.edible.key, i.edible.pct, now);
    // grams > 0: a recipe ingredient may weigh 0 g ("to taste").
    if (
      i.barcode &&
      i.kcal > 0 &&
      i.grams > 0 &&
      (i.source === 'label' || i.source === 'manual')
    )
      product.run(
        userId,
        i.barcode,
        i.name,
        per100(i.kcal, i.grams),
        per100(i.proteinG, i.grams),
        per100(i.fatG, i.grams),
        per100(i.carbsG, i.grams),
        i.unit ?? 'g',
        now,
        now,
      );
  };
}
