import {
  barcodeLookupSchema,
  myProductsSchema,
  type OffStatus,
  type Product,
} from '@oct/shared';
import { api, ApiError } from '../api/client';
import type { Db } from './db';

/** What the barcode field shows (OCT-313 §3): where it was found, or why Open Food Facts was not asked. */
export type BarcodeResult = {
  product: Product | null;
  from: 'mine' | 'off' | 'local' | null;
  off: OffStatus | 'offline';
};

/**
 * GET /api/barcodes/:code and keep what was found on this device; offline, the server down,
 * or not found there — the products on this device (ADR-0034 §7).
 */
export async function lookupProduct(
  db: Db,
  code: string,
): Promise<BarcodeResult> {
  let off: BarcodeResult['off'] = 'offline';
  try {
    const res = await api(`/api/barcodes/${code}`, barcodeLookupSchema);
    if (res.product) {
      await keepProduct(db, res.product);
      return res;
    }
    off = res.off;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    if (err.status !== 0) off = 'down';
  }
  const product = (await db.get('products', code)) ?? null;
  return { product, from: product && 'local', off };
}

/** A product found by barcode, kept on this device for the «Dish» sheet and offline (ADR-0034 §7). */
export const keepProduct = (db: Db, product: Product) =>
  db.put('products', product);

/** GET /api/products/mine into this device: at start and after a dish with a barcode is saved. */
export async function refreshMyProducts(db: Db) {
  const { products } = await api('/api/products/mine', myProductsSchema);
  const tx = db.transaction('products', 'readwrite');
  await Promise.all([...products.map((p) => tx.store.put(p)), tx.done]);
}
