import { LOCALES } from '@oct/shared';
import { appVersion } from '../version.js';

export const OFF_TIMEOUT_MS = 2500;
const USER_AGENT = `OpenCalorieTracker/${appVersion} (+https://github.com/mastekator/OpenCalorieTracker)`;
// Every interface language at once: the user's locale never leaves the server and one cached answer serves all.
const FIELDS = [
  'product_name',
  ...LOCALES.map((l) => `product_name_${l}`),
  'brands',
  'nutriments',
  'serving_quantity',
  'serving_size',
  'product_quantity',
  'product_quantity_unit',
].join(',');

/** An Open Food Facts product before the user's language is picked; `names.default` is product_name. */
export interface OffProduct {
  names: Record<string, string>;
  brand: string | null;
  kcal100: number | null;
  protein100: number | null;
  fat100: number | null;
  carbs100: number | null;
  per: 'g' | 'ml';
  servingG: number | null;
  servingText: string | null;
  packG: number | null;
}

export type OffResult =
  | { status: 'found'; product: OffProduct }
  | { status: 'missing' }
  | { status: 'down' };

const num = (v: unknown) => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};
const text = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** The fields of an OFF product object we keep (ADR-0034 §4). */
export function parseOffProduct(p: Record<string, unknown>): OffProduct {
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const kj = num(n['energy_100g']);
  const kcal =
    num(n['energy-kcal_100g']) ??
    (kj === null ? null : Math.round((kj / 4.184) * 10) / 10);
  const serving = num(p.serving_quantity);
  const pack = num(p.product_quantity);
  const names: Record<string, string> = {};
  const name = text(p.product_name);
  if (name) names.default = name;
  for (const l of LOCALES) {
    const local = text(p[`product_name_${l}`]);
    if (local) names[l] = local;
  }
  return {
    names,
    brand: text(String(p.brands ?? '').split(',')[0]),
    kcal100: kcal,
    protein100: num(n['proteins_100g']),
    fat100: num(n['fat_100g']),
    carbs100: num(n['carbohydrates_100g']),
    per: p.product_quantity_unit === 'ml' ? 'ml' : 'g',
    servingG:
      serving !== null && serving >= 1 && serving <= 2000 ? serving : null,
    servingText: text(p.serving_size),
    packG: pack !== null && pack >= 1 && pack <= 5000 ? pack : null,
  };
}

/**
 * Asks Open Food Facts for one code: only the number goes out, no cookies or installation data (AC-4.10).
 * Concurrent calls for the same code share one request.
 * shortcut: no limiter for OFF's 100 reads/min, add one if users report 429s.
 */
export function offClient(fetchFn: typeof fetch = fetch) {
  const inflight = new Map<string, Promise<OffResult>>();
  const ask = async (code: string): Promise<OffResult> => {
    try {
      const res = await fetchFn(
        `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`,
        {
          headers: { 'user-agent': USER_AGENT },
          signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
        },
      );
      if (res.status === 404) return { status: 'missing' };
      if (!res.ok) return { status: 'down' };
      const body = (await res.json()) as {
        status?: number;
        product?: Record<string, unknown>;
      };
      if (body.status === 0 || !body.product) return { status: 'missing' };
      return { status: 'found', product: parseOffProduct(body.product) };
    } catch {
      // Timeout, network, bad JSON: the user goes on without OFF (AC-4.13).
      return { status: 'down' };
    }
  };
  return (code: string) => {
    let pending = inflight.get(code);
    if (!pending) {
      pending = ask(code).finally(() => inflight.delete(code));
      inflight.set(code, pending);
    }
    return pending;
  };
}
