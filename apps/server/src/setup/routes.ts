import { randomBytes } from 'node:crypto';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import {
  passkeyVerifyRequestSchema,
  setupAdminRequestSchema,
  setupCodeRequestSchema,
  setupPasskeyOptionsRequestSchema,
  type Locale,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { setupMode } from '../config.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { challengeStore } from '../auth/challenges.js';
import { guard } from '../auth/guard.js';
import { passkeyHelpers } from '../auth/passkeys.js';
import { assertPasswordAllowed, hashPassword } from '../auth/password.js';
import { authHelpers } from '../auth/routes.js';
import { methodEnabled, type AuthEnv } from '../auth/session.js';
import {
  checkSetupCode,
  consumeSetupCode,
  setupCodeHash,
  type SetupCodeCheck,
} from './code.js';

interface Pending {
  challenge: string;
  email: string;
  name?: string;
  locale?: Locale;
  webauthnUserId: Buffer;
  /** The code checked at the options step; verify consumes it without asking again (ADR-0021 §5). */
  codeHash: Buffer;
}

const codeError = (state: Exclude<SetupCodeCheck, 'ok'>) =>
  ({
    invalid: new ApiError(400, 'setup_code_invalid'),
    expired: new ApiError(410, 'setup_code_expired'),
    burned: new ApiError(410, 'setup_code_burned'),
    done: new ApiError(409, 'setup_done'),
  })[state];

/**
 * The first-run wizard (ADR-0021 §3–5): the only routes that create an admin, and only with the
 * setup code from the log, on an empty database without ADMIN_EMAIL.
 */
export function setupRoutes(deps: AppDeps) {
  const { config, db } = deps;
  const { signedIn, userById } = authHelpers(deps);
  // Its own store: a challenge of sign-in or registration is unknown here, and the other way round.
  const pending = challengeStore<Pending>();
  const { failed, registrationOptions, verifyRegistration, insertPasskey } =
    passkeyHelpers(deps, pending);

  const wizardOnly: MiddlewareHandler = async (_c, next) => {
    if (setupMode(config, db) !== 'wizard') {
      throw db.prepare('SELECT 1 FROM users LIMIT 1').get()
        ? codeError('done')
        : new ApiError(404, 'not_found');
    }
    await next();
  };

  /** A wrong code is a failed attempt for the guard too, in the same transaction (ADR-0021 §3). */
  const checkCode = (c: Context<AuthEnv>, code: string) => {
    const attempts = guard(c, deps);
    attempts.check();
    const state = db.transaction(() => {
      const state = checkSetupCode(db, code);
      if (state === 'invalid') attempts.fail();
      return state;
    })();
    if (state !== 'ok') throw codeError(state);
    return attempts;
  };

  /** Consumes the code and writes the one admin with a sign-in method, or nothing (E-3.1). */
  const createAdmin = (
    codeHash: Buffer,
    user: Pick<Pending, 'email' | 'name' | 'locale' | 'webauthnUserId'>,
    addMethod: (userId: number | bigint, now: number) => number | undefined,
  ) => {
    const ids = db.transaction(() => {
      const state = consumeSetupCode(db, codeHash);
      if (state !== 'ok') throw codeError(state);
      const now = Date.now();
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO users (email, name, role, webauthn_user_id, locale, created_at, last_login_at)
           VALUES (?, ?, 'admin', ?, COALESCE(?, 'en'), ?, ?)`,
        )
        .run(
          user.email,
          user.name || null,
          user.webauthnUserId,
          user.locale ?? null,
          now,
          now,
        );
      return {
        userId: lastInsertRowid,
        passkeyId: addMethod(lastInsertRowid, now),
      };
    })();
    console.log('[info] admin account created in the setup wizard');
    return ids;
  };

  return new Hono<AuthEnv>()
    .use('/setup/*', wizardOnly)
    .post('/setup/code', validate('json', setupCodeRequestSchema), (c) => {
      checkCode(c, c.req.valid('json').code);
      return c.body(null, 204);
    })
    .post(
      '/setup/admin',
      methodEnabled(config, 'password'),
      validate('json', setupAdminRequestSchema),
      async (c) => {
        const { code, email, name, password, locale } = c.req.valid('json');
        const attempts = checkCode(c, code);
        assertPasswordAllowed(password, email);
        const hash = await hashPassword(password);
        const { userId } = createAdmin(
          setupCodeHash(code),
          { email, name, locale, webauthnUserId: randomBytes(16) },
          (id, now) => {
            db.prepare(
              'INSERT INTO passwords (user_id, hash, updated_at) VALUES (?, ?, ?)',
            ).run(id, hash, now);
            return undefined;
          },
        );
        attempts.succeed();
        return signedIn(c, userById(userId));
      },
    )
    .post(
      '/setup/admin/passkey/options',
      methodEnabled(config, 'passkey'),
      validate('json', setupPasskeyOptionsRequestSchema),
      async (c) => {
        const { code, email, name, locale } = c.req.valid('json');
        checkCode(c, code);
        const webauthnUserId = randomBytes(16);
        return registrationOptions(
          c,
          (challenge) => ({
            challenge,
            email,
            name,
            locale,
            webauthnUserId,
            codeHash: setupCodeHash(code),
          }),
          { email, name, webauthnUserId },
        );
      },
    )
    .post(
      '/setup/admin/passkey/verify',
      methodEnabled(config, 'passkey'),
      validate('json', passkeyVerifyRequestSchema),
      async (c) => {
        const { challengeId, response } = c.req.valid('json');
        const p = pending.take(challengeId);
        if (!p) throw failed();
        const credential = await verifyRegistration(response, p.challenge);
        const { userId, passkeyId } = createAdmin(p.codeHash, p, (id) =>
          insertPasskey(c, id, credential),
        );
        guard(c, deps).succeed();
        return signedIn(c, userById(userId), passkeyId);
      },
    );
}
