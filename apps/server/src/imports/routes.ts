import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv, type User } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { deleteMeals } from '../meals/remove.js';
import { COMMIT_BATCH, commitMeals, draftMeals } from './commit.js';
import {
  csvHead,
  draftPath,
  importsDir,
  MAX_IMPORT_BYTES,
  previewDraft,
  readOct,
  type Draft,
} from './draft.js';
import { guessColumns, mappingSchema, type Mapping } from './rules.js';

const commitSchema = z.object({
  includeDaysWithEntries: z.boolean().optional(),
  /** The browser's zone for CSV times, as a meal sends it; east-positive. OCT meals keep their own. */
  tzOffsetMin: z.number().int().min(-840).max(840).optional(),
});

/** Import drafts, their commit into the diary, the history and deleting an import (ADR-0026 §5). */
export function importRoutes({ config, db }: AppDeps) {
  const dir = importsDir(config.dataDir);

  /** Another user's, a done or a missing draft are the same 404. */
  const draftOf = (user: User, id: string): Draft => {
    const row = db
      .prepare(
        "SELECT id, source, mapping FROM imports WHERE id = ? AND user_id = ? AND status = 'draft'",
      )
      .get(Number(id), user.id) as
      | { id: number; source: Draft['source']; mapping: string | null }
      | undefined;
    if (!row) throw new ApiError(404, 'not_found');
    return {
      ...row,
      mapping: row.mapping ? (JSON.parse(row.mapping) as Mapping) : null,
    };
  };

  const ownImport = (user: User, id: string) =>
    /^\d+$/.test(id)
      ? (db
          .prepare(
            'SELECT id, status, records, committed_at FROM imports WHERE id = ? AND user_id = ?',
          )
          .get(Number(id), user.id) as
          | {
              id: number;
              status: 'draft' | 'done';
              records: number;
              committed_at: number;
            }
          | undefined)
      : undefined;

  const preview = (user: User, draft: Draft, include?: string) =>
    previewDraft(draft, draftPath(config.dataDir, draft.id), {
      daysWithEntries: new Set(
        db
          .prepare('SELECT DISTINCT local_date FROM meals WHERE user_id = ?')
          .pluck()
          .all(user.id) as string[],
      ),
      includeDaysWithEntries: include === '1',
      locale: user.locale,
    });

  return new Hono<AuthEnv>()
    .post('/imports', requireUser, async (c) => {
      const source = c.req.query('source');
      if (source !== 'oct' && source !== 'csv')
        throw new ApiError(400, 'validation_failed');
      if (Number(c.req.header('content-length')) > MAX_IMPORT_BYTES)
        throw new ApiError(413, 'import_too_large');
      const body = c.req.raw.body;
      if (!body) throw new ApiError(400, 'validation_failed');

      await mkdir(dir, { recursive: true });
      const part = join(dir, `${randomUUID()}.part`);
      try {
        // Streamed to disk, never whole in memory; the byte count also covers chunked bodies.
        const hash = createHash('sha256');
        let size = 0;
        await pipeline(
          Readable.fromWeb(body as ReadableStream<Uint8Array>),
          async function* (chunks: AsyncIterable<Buffer>) {
            for await (const chunk of chunks) {
              size += chunk.length;
              if (size > MAX_IMPORT_BYTES)
                throw new ApiError(413, 'import_too_large');
              hash.update(chunk);
              yield chunk;
            }
          },
          createWriteStream(part),
        );
        const sha = hash.digest('hex');
        // Only this user's imports: a hash must not tell anything about other accounts.
        if (
          db
            .prepare(
              "SELECT 1 FROM imports WHERE user_id = ? AND file_sha256 = ? AND status = 'done'",
            )
            .get(c.var.user.id, sha)
        )
          throw new ApiError(409, 'already_imported');
        // Checked before the draft exists, so a bad file leaves nothing behind.
        const head =
          source === 'oct' ? await readOct(part) : await csvHead(part);

        const id = Number(
          db
            .prepare(
              "INSERT INTO imports (user_id, source, file_sha256, status, created_at) VALUES (?, ?, ?, 'draft', ?)",
            )
            .run(c.var.user.id, source, sha, Date.now()).lastInsertRowid,
        );
        try {
          await rename(part, draftPath(config.dataDir, id));
        } catch (err) {
          db.prepare('DELETE FROM imports WHERE id = ?').run(id);
          throw err;
        }
        if ('headers' in head)
          return c.json({
            id,
            needsMapping: true,
            headers: head.headers,
            columns: guessColumns(head.headers),
            sample: head.sample,
          });
        return c.json(await preview(c.var.user, { id, source, mapping: null }));
      } finally {
        // Any error or a dropped request: the partial upload never stays on disk.
        await rm(part, { force: true });
      }
    })
    .put(
      '/imports/:id/mapping',
      requireUser,
      validate('json', mappingSchema),
      async (c) => {
        const draft = draftOf(c.var.user, c.req.param('id'));
        if (draft.source !== 'csv')
          throw new ApiError(400, 'validation_failed');
        const mapping = c.req.valid('json');
        const { headers } = await csvHead(
          draftPath(config.dataDir, draft.id),
          0,
        );
        if (Object.values(mapping.columns).some((i) => i >= headers.length))
          throw new ApiError(400, 'validation_failed');
        db.prepare('UPDATE imports SET mapping = ? WHERE id = ?').run(
          JSON.stringify(mapping),
          draft.id,
        );
        return c.json(
          await preview(
            c.var.user,
            { ...draft, mapping },
            c.req.query('includeDaysWithEntries'),
          ),
        );
      },
    )
    .get('/imports/:id/preview', requireUser, async (c) =>
      c.json(
        await preview(
          c.var.user,
          draftOf(c.var.user, c.req.param('id')),
          c.req.query('includeDaysWithEntries'),
        ),
      ),
    )
    .post(
      '/imports/:id/commit',
      requireUser,
      validate('json', commitSchema),
      async (c) => {
        const user = c.var.user;
        const done = ownImport(user, c.req.param('id'));
        // A repeat after the commit (a retried request) answers the same, writing nothing.
        if (done?.status === 'done') return c.json({ records: done.records });
        const draft = draftOf(user, c.req.param('id'));
        const body = c.req.valid('json');
        const path = draftPath(config.dataDir, draft.id);
        const meals = await draftMeals(
          draft,
          path,
          user.locale,
          body.tzOffsetMin ?? 0,
        );
        const records = await commitMeals(
          db,
          user.id,
          draft.id,
          meals,
          body.includeDaysWithEntries ?? false,
        );
        db.prepare(
          "UPDATE imports SET status = 'done', records = ?, committed_at = ? WHERE id = ?",
        ).run(records, Date.now(), draft.id);
        await rm(path, { force: true });
        return c.json({ records });
      },
    )
    .get('/imports', requireUser, (c) =>
      c.json(
        db
          .prepare(
            `SELECT id, source, committed_at AS committedAt, records FROM imports
             WHERE user_id = ? AND status = 'done' ORDER BY committed_at DESC, id DESC`,
          )
          .all(c.var.user.id),
      ),
    )
    .get('/imports/:id/delete-info', requireUser, (c) => {
      const row = ownImport(c.var.user, c.req.param('id'));
      if (row?.status !== 'done') throw new ApiError(404, 'not_found');
      return c.json(
        db
          .prepare(
            `SELECT count(i.id) AS records,
               count(DISTINCT CASE WHEN m.edited_at > ? THEN m.id END) AS edited,
               count(DISTINCT m.local_date) AS days
             FROM meals m LEFT JOIN meal_items i ON i.meal_id = m.id WHERE m.import_id = ?`,
          )
          .get(row.committed_at, row.id) as {
          records: number;
          edited: number;
          days: number;
        },
      );
    })
    .delete('/imports/:id', requireUser, async (c) => {
      const user = c.var.user;
      // Idempotent like a meal delete: missing or another user's → 204, no change.
      const row = ownImport(user, c.req.param('id'));
      if (row) {
        const batch = db.prepare(
          'SELECT id, client_id, photo_id FROM meals WHERE user_id = ? AND import_id = ? LIMIT ?',
        );
        for (;;) {
          const meals = batch.all(user.id, row.id, COMMIT_BATCH) as {
            id: number;
            client_id: string;
            photo_id: string | null;
          }[];
          if (!meals.length) break;
          await deleteMeals(db, config.dataDir, user.id, meals);
          await new Promise(setImmediate);
        }
        db.prepare('DELETE FROM imports WHERE id = ?').run(row.id);
        await rm(draftPath(config.dataDir, row.id), { force: true });
      }
      return c.body(null, 204);
    });
}
