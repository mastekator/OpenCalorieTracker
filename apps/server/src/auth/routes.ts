import { Hono } from 'hono';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  type AuthMethod,
  type MeResponse,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { renewDevice } from './device.js';
import { guard } from './guard.js';
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

/** Sign-in, sign-out, the current user and the password of one's own account (ADR-0003). */
export function authRoutes(deps: AppDeps) {
  const { config, db } = deps;
  const passwordOn = methodEnabled(config, 'password');
  const passwordHash = (userId: number) =>
    (
      db.prepare('SELECT hash FROM passwords WHERE user_id = ?').get(userId) as
        { hash: string } | undefined
    )?.hash;

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
        if (!user || !hash || !ok) {
          attempts.fail(email);
          throw new ApiError(401, 'invalid_credentials');
        }
        attempts.succeed();
        renewDevice(c, config);
        db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(
          Date.now(),
          user.id,
        );
        startSession(c, deps, user.id);
        return c.json(me(user));
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
