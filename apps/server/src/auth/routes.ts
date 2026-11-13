import { randomBytes } from 'node:crypto';
import { Hono, type Context } from 'hono';
import {
  changePasswordRequestSchema,
  inviteCheckRequestSchema,
  loginRequestSchema,
  recoverRequestSchema,
  registerRequestSchema,
  type AuthMethod,
  type InviteCheckResponse,
  type MeResponse,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { renewDevice } from './device.js';
import { guard } from './guard.js';
import { assertUsable, consumeLink, findLink } from './invites.js';
import {
  assertPasswordAllowed,
  dummyHash,
  hashPassword,
  verifyPassword,
} from './password.js';
import {
  endSession,
  methodEnabled,
  requireUser,
  startSession,
  type AuthEnv,
  type User,
} from './session.js';

/**
 * Sign-in, sign-out, registration, password recovery, the current user and the password of
 * one's own account (ADR-0003).
 */
export function authRoutes(deps: AppDeps) {
  const { config, db } = deps;
  const passwordOn = methodEnabled(config, 'password');
  const passwordHash = (userId: number) =>
    (
      db.prepare('SELECT hash FROM passwords WHERE user_id = ?').get(userId) as
        { hash: string } | undefined
    )?.hash;

  const userById = (id: number | bigint) =>
    db
      .prepare(
        `SELECT id, email, name, role, locale, theme, units, password_from_config
         FROM users WHERE id = ?`,
      )
      .get(id) as User;

  /** What a successful sign-in, registration or recovery does (AC-5.9). */
  const signedIn = (c: Context<AuthEnv>, user: User) => {
    renewDevice(c, config);
    startSession(c, deps, user.id);
    return c.json(me(user));
  };

  /** Looks the token up; an unknown or revoked one counts as a failed attempt (E-4.5). */
  const usableLink = (
    token: string,
    kind: 'invite' | 'recovery',
    attempts: ReturnType<typeof guard>,
  ) => {
    const link = findLink(db, token);
    if (link.status === 'invalid' || link.kind !== kind) {
      attempts.fail();
      throw new ApiError(400, 'invite_invalid');
    }
    assertUsable(link);
    return link;
  };

  const me = (user: User): MeResponse => {
    const methods: AuthMethod[] = [];
    if (passwordHash(user.id)) methods.push('password');
    if (db.prepare('SELECT 1 FROM passkeys WHERE user_id = ?').get(user.id)) {
      methods.push('passkey');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      locale: user.locale,
      theme: user.theme,
      units: user.units,
      passwordFromConfig: user.password_from_config === 1,
      methods,
    };
  };

  return new Hono<AuthEnv>()
    .post(
      '/auth/login',
      passwordOn,
      validate('json', loginRequestSchema),
      async (c) => {
        const { email, password } = c.req.valid('json');
        const attempts = guard(c, deps);
        attempts.check();
        const user = db
          .prepare(
            `SELECT id, email, name, role, locale, theme, units, password_from_config
             FROM users WHERE email = ?`,
          )
          .get(email) as User | undefined;
        const hash = user && passwordHash(user.id);
        // Unknown email, passkey-only user and wrong password all cost one scrypt and look alike (AC-5.2).
        const ok = await verifyPassword(password, hash ?? (await dummyHash()));
        // Concurrent guesses all pass the first check before any fails; none may answer once the guard closes.
        attempts.check();
        if (!user || !hash || !ok) {
          attempts.fail(email);
          throw new ApiError(401, 'invalid_credentials');
        }
        attempts.succeed();
        db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(
          Date.now(),
          user.id,
        );
        return signedIn(c, user);
      },
    )
    .post(
      '/auth/invites/check',
      validate('json', inviteCheckRequestSchema),
      (c) => {
        const attempts = guard(c, deps);
        attempts.check();
        const link = findLink(db, c.req.valid('json').token);
        // Expired and used tokens are real ones: only guesses count (E-4.5).
        if (link.status === 'invalid') attempts.fail();
        return c.json({
          kind: 'kind' in link ? link.kind : null,
          email: link.status === 'valid' ? link.email : null,
          status: link.status,
        } satisfies InviteCheckResponse);
      },
    )
    .post(
      '/auth/register',
      passwordOn,
      validate('json', registerRequestSchema),
      async (c) => {
        const { token, name, password, locale } = c.req.valid('json');
        const attempts = guard(c, deps);
        attempts.check();
        let email: string;
        if (token) {
          // The invite fixes the email; one in the body is ignored.
          email = usableLink(token, 'invite', attempts).email;
        } else if (config.registration === 'open') {
          const given = c.req.valid('json').email;
          if (!given) throw new ApiError(400, 'validation_failed');
          email = given;
        } else {
          throw new ApiError(403, 'invite_invalid'); // AC-3.5
        }
        assertPasswordAllowed(password, email);
        const hash = await hashPassword(password);
        attempts.check();
        const now = Date.now();
        // Taken emails, including ones with a pending invite, get one vague answer (AC-3.6, AC-2.9).
        const taken = new ApiError(409, 'registration_failed');
        let userId: number | bigint;
        try {
          userId = db.transaction(() => {
            if (token) consumeLink(db, token, 'invite');
            else if (
              db
                .prepare(
                  `SELECT 1 FROM invites WHERE kind = 'invite' AND email = ?
                   AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
                )
                .get(email, now)
            ) {
              throw taken;
            }
            const { lastInsertRowid } = db
              .prepare(
                `INSERT INTO users (email, name, role, webauthn_user_id, locale, created_at, last_login_at)
                 VALUES (?, ?, 'user', ?, COALESCE(?, 'en'), ?, ?)`,
              )
              .run(
                email,
                name || null,
                randomBytes(16),
                locale ?? null,
                now,
                now,
              );
            db.prepare(
              'INSERT INTO passwords (user_id, hash, updated_at) VALUES (?, ?, ?)',
            ).run(lastInsertRowid, hash, now);
            return lastInsertRowid;
          })();
        } catch (err) {
          // Counted outside the transaction, which the error rolls back.
          if (
            err === taken ||
            (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
          ) {
            attempts.fail(email);
            throw taken;
          }
          throw err;
        }
        attempts.succeed();
        return signedIn(c, userById(userId));
      },
    )
    .post(
      '/auth/recover',
      passwordOn,
      validate('json', recoverRequestSchema),
      async (c) => {
        const { token, password } = c.req.valid('json');
        const attempts = guard(c, deps);
        attempts.check();
        const { email } = usableLink(token, 'recovery', attempts);
        assertPasswordAllowed(password, email);
        const hash = await hashPassword(password);
        attempts.check();
        const now = Date.now();
        // Data, passkeys and other sessions stay as they are (AC-6.3, AC-6.4).
        const userId = db.transaction(() => {
          const link = consumeLink(db, token, 'recovery');
          db.prepare(
            `INSERT INTO passwords (user_id, hash, updated_at) VALUES (?, ?, ?)
             ON CONFLICT (user_id) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at`,
          ).run(link.user_id, hash, now);
          db.prepare(
            'UPDATE users SET password_from_config = 0, last_login_at = ? WHERE id = ?',
          ).run(now, link.user_id);
          return link.user_id!;
        })();
        attempts.succeed();
        return signedIn(c, userById(userId));
      },
    )
    .post('/auth/logout', (c) => {
      endSession(c, deps);
      return c.body(null, 204);
    })
    .get('/auth/me', requireUser, (c) => c.json(me(c.var.user)))
    .put(
      '/account/password',
      passwordOn,
      requireUser,
      validate('json', changePasswordRequestSchema),
      async (c) => {
        const { currentPassword, newPassword } = c.req.valid('json');
        const user = c.var.user;
        const hash = passwordHash(user.id);
        // Setting a first password needs no current one; changing it does.
        if (
          hash &&
          !(currentPassword && (await verifyPassword(currentPassword, hash)))
        ) {
          throw new ApiError(400, 'invalid_credentials');
        }
        assertPasswordAllowed(newPassword, user.email);
        const newHash = await hashPassword(newPassword);
        const now = Date.now();
        // Other sessions stay signed in (AC-6.3).
        db.transaction(() => {
          db.prepare(
            `INSERT INTO passwords (user_id, hash, updated_at) VALUES (?, ?, ?)
             ON CONFLICT (user_id) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at`,
          ).run(user.id, newHash, now);
          db.prepare(
            'UPDATE users SET password_from_config = 0 WHERE id = ?',
          ).run(user.id);
        })();
        return c.body(null, 204);
      },
    );
}
