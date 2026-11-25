import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { exportQuerySchema, type ExportSummary } from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { userToday } from '../profile/routes.js';
import { planExport } from './build.js';
import { writeZip, ZIP_MAX_BYTES, ZIP_MAX_ENTRIES } from './zip.js';

/** Diary export (ADR-0026 §2–4): session only, so a leaked API token cannot take the whole diary. */
export function exportRoutes({ db, config }: AppDeps) {
  return new Hono<AuthEnv>()
    .get(
      '/export/summary',
      requireUser,
      validate('query', exportQuerySchema),
      async (c) => {
        const { days, dishes, photos, bytes } = await planExport(
          db,
          config.dataDir,
          c.var.user.id,
          c.req.valid('query'),
          new Date(),
        );
        return c.json({ days, dishes, photos, bytes } satisfies ExportSummary);
      },
    )
    .get(
      '/export',
      requireUser,
      validate('query', exportQuerySchema),
      async (c) => {
        const q = c.req.valid('query');
        const userId = c.var.user.id;
        const now = new Date();
        const plan = await planExport(db, config.dataDir, userId, q, now);
        if (plan.bytes > ZIP_MAX_BYTES || plan.entries.length > ZIP_MAX_ENTRIES)
          throw new ApiError(413, 'export_too_large');

        async function* body() {
          if (plan.json) yield plan.json;
          else yield* writeZip(plan.entries, now);
          // Reached only when the whole body was read: a broken-off download is not "the last export".
          db.prepare(
            'UPDATE users SET last_export_at = ?, last_export_format = ? WHERE id = ?',
          ).run(Date.now(), q.format, userId);
        }
        const ext = plan.json ? 'json' : 'zip';
        return c.body(
          Readable.toWeb(
            Readable.from(body(), { objectMode: false }),
          ) as ReadableStream,
          200,
          {
            'Content-Type': plan.json ? 'application/json' : 'application/zip',
            'Content-Length': String(plan.bytes),
            'Content-Disposition': `attachment; filename="oct-export-${userToday(db, userId)}.${ext}"`,
            'Cache-Control': 'no-store',
          },
        );
      },
    );
}
