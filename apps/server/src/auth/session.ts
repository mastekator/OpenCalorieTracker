import { createHash, randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { AuthMethod } from '@oct/shared';
import type { AppDeps } from '../app.js';
import type { Config } from '../config.js';
import { ApiError } from '../http/errors.js';

const COOKIE = 'oct_session';
const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL = 90 * DAY;
/** Sliding expiry writes at most once an hour per session (AC-5.4). */
export const RENEW_AFTER = 60 * 60 * 1000;

export interface User {
  id: number;
  email: string;
  name: string | null;
  role: 'admin' | 'user';
  locale: string;
  theme: string;
  password_from_config: 0 | 1;
}

export type AuthEnv = { Variables: { user?: User } };

const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest();

const cookieOptions = (config: Config) => ({
  httpOnly: true,
  // PUBLIC_URL may be plain http only on localhost, where not every browser keeps Secure cookies.
  secure: !config.publicUrl?.startsWith('http://localhost'),
  sameSite: 'Strict' as const,
  path: '/',
  maxAge: SESSION_TTL / 1000,
});

export function startSession(
  c: Context,
  { config, db }: AppDeps,
  userId: number,
) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (user_id, token_hash, created_at, last_seen_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    tokenHash(token),
    now,
    now,
    now + SESSION_TTL,
    c.req.header('user-agent') ?? null,
  );
  setCookie(c, COOKIE, token, cookieOptions(config));
}

export function endSession(c: Context, { config, db }: AppDeps) {
  const token = getCookie(c, COOKIE);
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(
      tokenHash(token),
    );
  }
  deleteCookie(c, COOKIE, cookieOptions(config));
}

/** Sets `c.var.user` for a live session and slides its expiry; never rejects by itself. */
export const session = ({ config, db }: AppDeps) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const token = getCookie(c, COOKIE);
    if (token) {
      const now = Date.now();
      // Deleting a user cascades to its sessions, so this also covers E-5.4.
      const row = db
        .prepare(
          `SELECT s.id AS session_id, s.last_seen_at, u.id, u.email, u.name, u.role,
                  u.locale, u.theme, u.password_from_config
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ? AND s.expires_at > ?`,
        )
        .get(tokenHash(token), now) as
        (User & { session_id: number; last_seen_at: number }) | undefined;
      if (row) {
        const { session_id, last_seen_at, ...user } = row;
        if (now - last_seen_at >= RENEW_AFTER) {
          db.prepare(
            'UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?',
          ).run(now, now + SESSION_TTL, session_id);
          setCookie(c, COOKIE, token, cookieOptions(config));
        }
        c.set('user', user);
      }
    }
    await next();
  });

export const requireUser = createMiddleware<
  AuthEnv & { Variables: { user: User } }
>(async (c, next) => {
  if (!c.var.user) throw new ApiError(401, 'unauthenticated');
  await next();
});

export const requireAdmin = createMiddleware<
  AuthEnv & { Variables: { user: User } }
>(async (c, next) => {
  if (!c.var.user) throw new ApiError(401, 'unauthenticated');
  if (c.var.user.role !== 'admin') throw new ApiError(403, 'forbidden');
  await next();
});

/** AC-0.9: endpoints of a sign-in method switched off in AUTH_METHODS answer 403. */
export const methodEnabled = (config: Config, method: AuthMethod) =>
  createMiddleware(async (_c, next) => {
    if (!config.authMethods.includes(method)) {
      throw new ApiError(403, 'method_disabled');
    }
    await next();
  });
