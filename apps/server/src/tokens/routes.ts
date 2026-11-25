import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import {
  createApiTokenRequestSchema,
  MAX_API_TOKENS,
  type ApiToken,
  type ApiTokenScope,
  type CreatedApiToken,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, tokenHash, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { integrationsPolicy } from '../integrations/routes.js';

const DAY = 24 * 60 * 60 * 1000;

interface Row {
  id: number;
  name: string;
  scope: ApiTokenScope;
  created_at: number;
  expires_at: number | null;
  last_used_at: number | null;
}

const iso = (ms: number | null) =>
  ms === null ? null : new Date(ms).toISOString();
const toApi = (r: Row): ApiToken => ({
  id: r.id,
  name: r.name,
  scope: r.scope,
  createdAt: iso(r.created_at)!,
  expiresAt: iso(r.expires_at),
  lastUsedAt: iso(r.last_used_at),
});

/** Token management, by session only: tokenAuth never runs on /api/tokens (ADR-0027 §1). */
export function tokenRoutes({ db, config }: AppDeps) {
  return new Hono<AuthEnv>()
    .get('/tokens', requireUser, (c) => {
      const rows = db
        .prepare(
          `SELECT id, name, scope, created_at, expires_at, last_used_at
           FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
        )
        .all(c.var.user.id) as Row[];
      return c.json(rows.map(toApi));
    })
    .post(
      '/tokens',
      requireUser,
      validate('json', createApiTokenRequestSchema),
      (c) => {
        // A token the admin forbade would only answer 403; listing and deleting stay open.
        if (!integrationsPolicy(db, config).tokens)
          throw new ApiError(403, 'integrations_disabled');
        const userId = c.var.user.id;
        const count = db
          .prepare('SELECT count(*) FROM api_tokens WHERE user_id = ?')
          .pluck()
          .get(userId) as number;
        if (count >= MAX_API_TOKENS) throw new ApiError(409, 'limit_reached');
        const { name, scope, expiresInDays } = c.req.valid('json');
        const token = `oct_${randomBytes(32).toString('base64url')}`;
        const now = Date.now();
        const row = db
          .prepare(
            `INSERT INTO api_tokens (user_id, name, scope, token_hash, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)
           RETURNING id, name, scope, created_at, expires_at, last_used_at`,
          )
          .get(
            userId,
            name,
            scope,
            tokenHash(token),
            now,
            expiresInDays === null ? null : now + expiresInDays * DAY,
          ) as Row;
        return c.json({ ...toApi(row), token } satisfies CreatedApiToken, 201);
      },
    )
    .delete('/tokens/:id', requireUser, (c) => {
      // Idempotent; someone else's id deletes nothing.
      db.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').run(
        Number(c.req.param('id')),
        c.var.user.id,
      );
      return c.body(null, 204);
    })
    .delete('/tokens', requireUser, (c) => {
      db.prepare('DELETE FROM api_tokens WHERE user_id = ?').run(c.var.user.id);
      return c.body(null, 204);
    });
}
