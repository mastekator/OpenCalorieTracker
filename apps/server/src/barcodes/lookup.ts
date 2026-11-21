import type { Database } from 'better-sqlite3';
import type { BarcodeLookup, Locale, Product } from '@oct/shared';
import type { Config } from '../config.js';
import { integrationsPolicy } from '../integrations/routes.js';
import type { OffProduct, OffResult } from './off.js';

const DAY = 24 * 60 * 60 * 1000;
export const FOUND_TTL = 30 * DAY;
export const MISSING_TTL = DAY;

interface ProductRow {
  code: string;
  brand: string | null;
  kcal_100: number | null;
  protein_100: number | null;
  fat_100: number | null;
  carbs_100: number | null;
  per: 'g' | 'ml';
  serving_g: number | null;
}
type CacheRow = ProductRow & {
  status: 'found' | 'missing';
  names: string | null;
  serving_text: string | null;
  pack_g: number | null;
  fetched_at: number;
};
type MineRow = ProductRow & { name: string; updated_at: number };

const fromRow = (
  r: ProductRow,
  name: string | null,
  servingText: string | null,
): Product => ({
  code: r.code,
  name,
  brand: r.brand,
  kcal100: r.kcal_100,
  protein100: r.protein_100,
  fat100: r.fat_100,
  carbs100: r.carbs_100,
  per: r.per,
  servingG: r.serving_g,
  servingText,
  packG: null,
  pieces: null,
  last: null,
});

export const mineToProduct = (r: MineRow): Product => ({
  ...fromRow(r, r.name, null),
  savedAt: new Date(r.updated_at).toISOString(),
});

/** The name in the user's language, else product_name (AC-4.12). */
const cachedProduct = (r: CacheRow, locale: Locale) => {
  const names = JSON.parse(r.names ?? '{}') as Record<string, string>;
  return {
    ...fromRow(r, names[locale] ?? names.default ?? null, r.serving_text),
    packG: r.pack_g,
  };
};

function storeOff(db: Database, code: string, off: OffResult, now: number) {
  const p: Partial<OffProduct> = off.status === 'found' ? off.product : {};
  db.prepare(
    `INSERT OR REPLACE INTO food_products (code, status, names, brand, kcal_100, protein_100, fat_100,
       carbs_100, per, serving_g, serving_text, pack_g, fetched_at)
     VALUES (@code, @status, @names, @brand, @kcal, @protein, @fat, @carbs, @per, @servingG, @servingText, @packG, @now)`,
  ).run({
    code,
    status: off.status,
    names: p.names ? JSON.stringify(p.names) : null,
    brand: p.brand ?? null,
    kcal: p.kcal100 ?? null,
    protein: p.protein100 ?? null,
    fat: p.fat100 ?? null,
    carbs: p.carbs100 ?? null,
    per: p.per ?? null,
    servingG: p.servingG ?? null,
    servingText: p.servingText ?? null,
    packG: p.packG ?? null,
    now,
  });
}

/** Own product → cache → Open Food Facts (ADR-0034 §3, §4). `code` is already normalized. */
export async function lookupBarcode(
  {
    db,
    config,
    askOff,
  }: {
    db: Database;
    config: Pick<Config, 'outbound'>;
    askOff: (code: string) => Promise<OffResult>;
  },
  user: { id: number; locale: Locale },
  code: string,
  now = Date.now(),
): Promise<BarcodeLookup> {
  const mine = db
    .prepare('SELECT * FROM user_products WHERE user_id = ? AND code = ?')
    .get(user.id, code) as MineRow | undefined;
  // The user's own product wins and OFF is not asked (E-8).
  if (mine)
    return { product: mineToProduct(mine), from: 'mine', off: 'skipped' };

  const cached = db
    .prepare('SELECT * FROM food_products WHERE code = ?')
    .get(code) as CacheRow | undefined;
  const found = (r: CacheRow, off: 'found' | 'down'): BarcodeLookup => ({
    product: cachedProduct(r, user.locale),
    from: 'off',
    off,
  });
  const none = (off: BarcodeLookup['off']): BarcodeLookup => ({
    product: null,
    from: null,
    off,
  });
  if (cached) {
    const ttl = cached.status === 'found' ? FOUND_TTL : MISSING_TTL;
    if (now - cached.fetched_at < ttl)
      return cached.status === 'found'
        ? found(cached, 'found')
        : none('missing');
  }

  if (!integrationsPolicy(db, config).outbound) return none('blocked');
  const enabled = db
    .prepare('SELECT off_enabled FROM users WHERE id = ?')
    .pluck()
    .get(user.id);
  if (enabled !== 1) return none('disabled');

  const off = await askOff(code);
  if (off.status === 'down')
    // A stale product beats nothing while OFF is down.
    return cached?.status === 'found' ? found(cached, 'down') : none('down');
  storeOff(db, code, off, now);
  if (off.status === 'missing') return none('missing');
  return found(
    db
      .prepare('SELECT * FROM food_products WHERE code = ?')
      .get(code) as CacheRow,
    'found',
  );
}
