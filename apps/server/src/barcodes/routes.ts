import { Hono } from 'hono';
import { normalizeGtin, type MyProducts } from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { lookupBarcode, mineToProduct } from './lookup.js';
import { offClient } from './off.js';

export function barcodeRoutes({ db, config, fetch }: AppDeps) {
  const askOff = offClient(fetch);
  return new Hono<AuthEnv>()
    .get('/barcodes/:code', requireUser, async (c) => {
      const code = normalizeGtin(c.req.param('code'));
      if (!code) throw new ApiError(400, 'barcode_invalid');
      return c.json(
        await lookupBarcode({ db, config, askOff }, c.var.user, code),
      );
    })
    .get('/products/mine', requireUser, (c) => {
      const rows = db
        .prepare(
          'SELECT * FROM user_products WHERE user_id = ? ORDER BY updated_at DESC',
        )
        .all(c.var.user.id) as Parameters<typeof mineToProduct>[0][];
      return c.json({ products: rows.map(mineToProduct) } satisfies MyProducts);
    });
}
