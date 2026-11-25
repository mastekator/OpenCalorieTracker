import { createMiddleware } from 'hono/factory';
import type { ApiTokenScope } from '@oct/shared';
import type { AppDeps } from '../app.js';
import {
  tokenHash,
  USER_COLUMNS,
  type AuthEnv,
  type User,
} from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { integrationsPolicy } from '../integrations/routes.js';

const MINUTE = 60_000;
/** Requests per token per minute (ADR-0027 §1). */
export const TOKEN_RATE_LIMIT = 60;

/**
 * Signs in by `Authorization: Bearer oct_…` on /api/v1/* and /mcp only (ADR-0027 §1).
 * Replaces any cookie session, so a bad token never falls back to the session's user.
 * Create it once and share it between paths: the rate limit lives in the instance.
 */
export function tokenAuth({ db, config }: Pick<AppDeps, 'db' | 'config'>) {
  // shortcut: per-process fixed window; fine for one container, a restart resets it.
  const windows = new Map<number, { start: number; count: number }>();
  return createMiddleware<AuthEnv>(async (c, next) => {
    c.set('user', undefined);
    c.set('sessionId', undefined);
    if (!integrationsPolicy(db, config).tokens)
      throw new ApiError(403, 'integrations_disabled');
    const token = /^Bearer (oct_\S+)$/.exec(
      c.req.header('authorization') ?? '',
    )?.[1];
    const now = Date.now();
    // Deleting a user cascades to its tokens.
    const row =
      token &&
      (db
        .prepare(
          `SELECT t.id AS token_id, t.scope, t.last_used_at, ${USER_COLUMNS}
           FROM api_tokens t JOIN users u ON u.id = t.user_id
           WHERE t.token_hash = ? AND (t.expires_at IS NULL OR t.expires_at > ?)`,
        )
        .get(tokenHash(token), now) as
        | (User & {
            token_id: number;
            scope: ApiTokenScope;
            last_used_at: number | null;
          })
        | undefined);
    // One answer for missing, expired and revoked: no hints (ADR-0027 §1).
    if (!row) throw new ApiError(401, 'invalid_token');
    const { token_id, scope, last_used_at, ...user } = row;

    let w = windows.get(token_id);
    if (!w || now - w.start >= MINUTE) {
      w = { start: now, count: 0 };
      windows.set(token_id, w);
    }
    if (++w.count > TOKEN_RATE_LIMIT) {
      const wait = Math.max(1, Math.ceil((w.start + MINUTE - now) / 1000));
      c.header('Retry-After', String(wait));
      throw new ApiError(429, 'rate_limited');
    }
    if (last_used_at === null || now - last_used_at >= MINUTE)
      db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(
        now,
        token_id,
      );
    c.set('user', user);
    c.set('tokenScope', scope);
    await next();
  });
}
