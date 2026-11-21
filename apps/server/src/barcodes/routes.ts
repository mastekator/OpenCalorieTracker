import { Hono } from 'hono';
import {
  normalizeGtin,
  type MyProducts,
  type PhotoBarcodesResponse,
} from '@oct/shared';
import { readJpeg } from '../ai/routes.js';
import type { RouteDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { photoPath } from '../photos/store.js';
import {
  cachedProduct,
  lookupBarcode,
  mineToProduct,
  withPrefs,
} from './lookup.js';
import { offClient } from './off.js';
import { readBarcodes } from './read.js';

export function barcodeRoutes({ db, config, fetch, photoBarcodes }: RouteDeps) {
  const askOff = offClient(fetch);
  return (
    new Hono<AuthEnv>()
      .get('/barcodes/:code', requireUser, async (c) => {
        const code = normalizeGtin(c.req.param('code'));
        if (!code) throw new ApiError(400, 'barcode_invalid');
        return c.json(
          await lookupBarcode({ db, config, askOff }, c.var.user, code),
        );
      })
      // Works without AI (ADR-0034 §1); the codes are looked up in parallel.
      .post('/photos/:id/barcodes', requireUser, async (c) => {
        const user = c.var.user;
        const photoId = c.req.param('id');
        const jpg = photoPath(config.dataDir, user.id, photoId, 'full');
        if (!jpg) throw new ApiError(404, 'not_found');
        const preview = photoPath(config.dataDir, user.id, photoId, 'preview')!;
        const codes = await photoBarcodes(`${user.id}:${photoId}`, () =>
          readJpeg(jpg, preview).then(readBarcodes),
        );
        return c.json({
          codes: await Promise.all(
            codes.map(async (code) => ({
              code,
              result: await lookupBarcode({ db, config, askOff }, user, code),
            })),
          ),
        } satisfies PhotoBarcodesResponse);
      })
      .get('/products/mine', requireUser, (c) => {
        const rows = db
          .prepare(
            'SELECT * FROM user_products WHERE user_id = ? ORDER BY updated_at DESC',
          )
          .all(c.var.user.id) as Parameters<typeof mineToProduct>[0][];
        // Cached OFF products the user set a package weight or amount for; no savedAt, not "mine".
        const off = db
          .prepare(
            `SELECT f.* FROM product_prefs p JOIN food_products f ON f.code = p.code
             WHERE p.user_id = ? AND f.status = 'found' AND NOT EXISTS
               (SELECT 1 FROM user_products u WHERE u.user_id = p.user_id AND u.code = p.code)
             ORDER BY p.updated_at DESC`,
          )
          .all(c.var.user.id) as Parameters<typeof cachedProduct>[0][];
        return c.json({
          products: [
            ...rows.map(mineToProduct),
            ...off.map((r) => cachedProduct(r, c.var.user.locale)),
          ].map((p) => withPrefs(db, c.var.user.id, p)),
        } satisfies MyProducts);
      })
  );
}
