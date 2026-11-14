import { randomBytes } from 'node:crypto';
import { Hono, type Context } from 'hono';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import {
  passkeyRecoverOptionsRequestSchema,
  passkeyRegisterOptionsRequestSchema,
  passkeyRenameRequestSchema,
  passkeyVerifyRequestSchema,
  type Locale,
  type Passkey,
  type PasskeyOptionsResponse,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { challengeStore } from './challenges.js';
import { guard } from './guard.js';
import { consumeLink } from './invites.js';
import { authHelpers } from './routes.js';
import {
  methodEnabled,
  requireUser,
  type AuthEnv,
  type User,
} from './session.js';

type Pending =
  | { purpose: 'login'; challenge: string }
  | {
      purpose: 'register';
      challenge: string;
      token?: string;
      email: string;
      name?: string;
      locale?: Locale;
      webauthnUserId: Buffer;
    }
  | { purpose: 'recover'; challenge: string; token: string; userId: number }
  | { purpose: 'add'; challenge: string; userId: number };

/** Default passkey name from the User-Agent, e.g. "iPhone · Safari" (ADR-0003). */
export function passkeyName(ua = '') {
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh|Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /Firefox\/|FxiOS\//.test(ua)
      ? 'Firefox'
      : /Chrome\/|CriOS\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null;
  return [device, browser].filter(Boolean).join(' · ') || 'Passkey';
}

/**
 * Passkey sign-in, registration, recovery and "My passkeys" (ADR-0003). Sign-in is outside the
 * brute-force guard (AC-5.10); users and passkeys are written only after the authenticator's
 * answer checks out, so a cancelled dialog leaves nothing behind (E-3.2).
 */
export function passkeyRoutes(deps: AppDeps) {
  const { config, db } = deps;
  const { passwordHash, userById, signedIn, usableLink, emailTaken } =
    authHelpers(deps);
  const passkeyOn = methodEnabled(config, 'passkey');
  const pending = challengeStore<Pending>();
  const rpName = 'OpenCalorieTracker';

  const rp = () => {
    if (!config.publicUrl) throw new ApiError(409, 'not_configured');
    return { origin: config.publicUrl, id: new URL(config.publicUrl).hostname };
  };

  const failed = () => new ApiError(400, 'passkey_failed');

  /** The options step's record; it is bound to its endpoint and to the signed-in user, if any. */
  const take = <P extends Pending['purpose']>(id: string, purpose: P) => {
    const entry = pending.take(id);
    if (entry?.purpose !== purpose) throw failed();
    return entry as Extract<Pending, { purpose: P }>;
  };

  const userPasskeys = (userId: number) =>
    (
      db
        .prepare(
          'SELECT credential_id, transports FROM passkeys WHERE user_id = ?',
        )
        .all(userId) as { credential_id: Buffer; transports: string | null }[]
    ).map((p) => ({
      id: p.credential_id.toString('base64url'),
      transports: p.transports ? (JSON.parse(p.transports) as string[]) : [],
    }));

  const registrationOptions = async (
    c: Context,
    pend: (challenge: string) => Pending,
    user: { email: string; name?: string | null; webauthnUserId: Buffer },
    exclude: { id: string; transports: string[] }[] = [],
  ) => {
    const options = await generateRegistrationOptions({
      rpName,
      rpID: rp().id,
      userName: user.email,
      userDisplayName: user.name || user.email,
      userID: new Uint8Array(user.webauthnUserId),
      attestationType: 'none',
      excludeCredentials: exclude,
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
    });
    return c.json({
      challengeId: pending.put(pend(options.challenge)),
      options,
    } satisfies PasskeyOptionsResponse);
  };

  const verifyRegistration = async (response: unknown, challenge: string) => {
    const { origin, id } = rp();
    const result = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: id,
      requireUserVerification: false,
    }).catch(() => null);
    if (!result?.verified) throw failed();
    return result.registrationInfo.credential;
  };

  /** Call inside the transaction that acts on the token or the user. */
  const insertPasskey = (
    c: Context,
    userId: number | bigint,
    credential: WebAuthnCredential,
  ) => {
    try {
      return db
        .prepare(
          `INSERT INTO passkeys (user_id, credential_id, public_key, counter, transports, name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId,
          Buffer.from(credential.id, 'base64url'),
          Buffer.from(credential.publicKey),
          credential.counter,
          credential.transports ? JSON.stringify(credential.transports) : null,
          passkeyName(c.req.header('user-agent')),
          Date.now(),
        ).lastInsertRowid as number;
    } catch (err) {
      // The same authenticator registered twice despite excludeCredentials.
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw failed();
      }
      throw err;
    }
  };

  /** "This device" is the passkey the current session was opened or last extended with. */
  type Signed = { var: { user: User; sessionId?: number } };
  const listPasskeys = (c: Signed, id: number | null = null) =>
    (
      db
        .prepare(
          `SELECT p.id, COALESCE(p.name, 'Passkey') AS name, p.created_at AS createdAt,
                  p.last_used_at AS lastUsedAt, p.id IS s.passkey_id AS thisDevice
           FROM passkeys p LEFT JOIN sessions s ON s.id = @sessionId
           WHERE p.user_id = @userId AND (@id IS NULL OR p.id = @id)
           ORDER BY p.created_at, p.id`,
        )
        .all({
          sessionId: c.var.sessionId,
          userId: c.var.user.id,
          id,
        }) as (Omit<Passkey, 'thisDevice'> & { thisDevice: 0 | 1 })[]
    ).map((p): Passkey => ({ ...p, thisDevice: p.thisDevice === 1 }));
  const passkeyById = (c: Signed, id: number) => listPasskeys(c, id)[0];

  const passkeyId = (c: Context) => {
    const id = Number(c.req.param('id'));
    if (!Number.isSafeInteger(id)) throw new ApiError(404, 'not_found');
    return id;
  };

  return new Hono<AuthEnv>()
    .post('/auth/passkey/login/options', passkeyOn, async (c) => {
      const options = await generateAuthenticationOptions({
        rpID: rp().id,
        userVerification: 'preferred',
      });
      return c.json({
        challengeId: pending.put({
          purpose: 'login',
          challenge: options.challenge,
        }),
        options,
      } satisfies PasskeyOptionsResponse);
    })
    .post(
      '/auth/passkey/login/verify',
      passkeyOn,
      validate('json', passkeyVerifyRequestSchema),
      async (c) => {
        const { challengeId, response } = c.req.valid('json');
        const { challenge } = take(challengeId, 'login');
        const row = db
          .prepare(
            `SELECT p.id, p.user_id, p.public_key, p.counter, p.transports, u.webauthn_user_id
             FROM passkeys p JOIN users u ON u.id = p.user_id
             WHERE p.credential_id = ?`,
          )
          .get(Buffer.from(response.id, 'base64url')) as
          | {
              id: number;
              user_id: number;
              public_key: Buffer;
              counter: number;
              transports: string | null;
              webauthn_user_id: Buffer;
            }
          | undefined;
        const handle = response.response.userHandle;
        // Removed passkey, deleted user, or a credential of another server on the same domain (E-5.3).
        if (
          !row ||
          !handle ||
          !Buffer.from(handle, 'base64url').equals(row.webauthn_user_id)
        ) {
          throw new ApiError(401, 'passkey_unknown');
        }
        const { origin, id } = rp();
        const result = await verifyAuthenticationResponse({
          response: response as unknown as AuthenticationResponseJSON,
          expectedChallenge: challenge,
          expectedOrigin: origin,
          expectedRPID: id,
          requireUserVerification: false,
          credential: {
            id: response.id,
            publicKey: new Uint8Array(row.public_key),
            counter: row.counter,
            transports: row.transports
              ? (JSON.parse(row.transports) as string[])
              : undefined,
          },
        }).catch(() => null);
        if (!result?.verified) throw failed();
        const now = Date.now();
        db.transaction(() => {
          db.prepare(
            'UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?',
          ).run(result.authenticationInfo.newCounter, now, row.id);
          db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(
            now,
            row.user_id,
          );
        })();
        return signedIn(c, userById(row.user_id), row.id);
      },
    )
    .post(
      '/auth/register/passkey/options',
      passkeyOn,
      validate('json', passkeyRegisterOptionsRequestSchema),
      async (c) => {
        const { token, name, locale } = c.req.valid('json');
        const attempts = guard(c, deps);
        attempts.check();
        let email: string;
        if (token) {
          email = usableLink(token, 'invite', attempts).email;
        } else if (config.registration === 'open') {
          const given = c.req.valid('json').email;
          if (!given) throw new ApiError(400, 'validation_failed');
          // Checked here so nobody goes through the authenticator dialog for nothing (AC-3.6).
          if (emailTaken(given)) {
            attempts.fail(given);
            throw new ApiError(409, 'registration_failed');
          }
          email = given;
        } else {
          throw new ApiError(403, 'invite_invalid'); // AC-3.5
        }
        const webauthnUserId = randomBytes(16);
        return registrationOptions(
          c,
          (challenge) => ({
            purpose: 'register',
            challenge,
            token,
            email,
            name: name || undefined,
            locale,
            webauthnUserId,
          }),
          { email, name, webauthnUserId },
        );
      },
    )
    .post(
      '/auth/register/passkey/verify',
      passkeyOn,
      validate('json', passkeyVerifyRequestSchema),
      async (c) => {
        const { challengeId, response } = c.req.valid('json');
        const p = take(challengeId, 'register');
        const credential = await verifyRegistration(response, p.challenge);
        const attempts = guard(c, deps);
        const now = Date.now();
        const taken = new ApiError(409, 'registration_failed');
        let ids: { userId: number | bigint; passkeyId: number };
        try {
          ids = db.transaction(() => {
            if (p.token) consumeLink(db, p.token, 'invite');
            else if (emailTaken(p.email)) throw taken;
            const { lastInsertRowid } = db
              .prepare(
                `INSERT INTO users (email, name, role, webauthn_user_id, locale, created_at, last_login_at)
                 VALUES (?, ?, 'user', ?, COALESCE(?, 'en'), ?, ?)`,
              )
              .run(
                p.email,
                p.name ?? null,
                p.webauthnUserId,
                p.locale ?? null,
                now,
                now,
              );
            return {
              userId: lastInsertRowid,
              passkeyId: insertPasskey(c, lastInsertRowid, credential),
            };
          })();
        } catch (err) {
          if (
            err === taken ||
            (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
          ) {
            attempts.fail(p.email);
            throw taken;
          }
          throw err;
        }
        attempts.succeed();
        return signedIn(c, userById(ids.userId), ids.passkeyId);
      },
    )
    .post(
      '/auth/recover/passkey/options',
      passkeyOn,
      validate('json', passkeyRecoverOptionsRequestSchema),
      async (c) => {
        const { token } = c.req.valid('json');
        const attempts = guard(c, deps);
        attempts.check();
        const userId = usableLink(token, 'recovery', attempts).user_id!;
        const user = db
          .prepare(
            'SELECT email, name, webauthn_user_id FROM users WHERE id = ?',
          )
          .get(userId) as {
          email: string;
          name: string | null;
          webauthn_user_id: Buffer;
        };
        return registrationOptions(
          c,
          (challenge) => ({ purpose: 'recover', challenge, token, userId }),
          { ...user, webauthnUserId: user.webauthn_user_id },
          userPasskeys(userId),
        );
      },
    )
    .post(
      '/auth/recover/passkey/verify',
      passkeyOn,
      validate('json', passkeyVerifyRequestSchema),
      async (c) => {
        const { challengeId, response } = c.req.valid('json');
        const p = take(challengeId, 'recover');
        const credential = await verifyRegistration(response, p.challenge);
        // Other passkeys, the password and other sessions stay as they are (AC-6.4).
        const passkeyId = db.transaction(() => {
          consumeLink(db, p.token, 'recovery');
          db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(
            Date.now(),
            p.userId,
          );
          return insertPasskey(c, p.userId, credential);
        })();
        guard(c, deps).succeed();
        return signedIn(c, userById(p.userId), passkeyId);
      },
    )
    .get('/account/passkeys', passkeyOn, requireUser, (c) =>
      c.json(listPasskeys(c)),
    )
    .post('/account/passkeys/options', passkeyOn, requireUser, async (c) => {
      const user = c.var.user;
      const { webauthn_user_id } = db
        .prepare('SELECT webauthn_user_id FROM users WHERE id = ?')
        .get(user.id) as { webauthn_user_id: Buffer };
      return registrationOptions(
        c,
        (challenge) => ({ purpose: 'add', challenge, userId: user.id }),
        { ...user, webauthnUserId: webauthn_user_id },
        userPasskeys(user.id),
      );
    })
    .post(
      '/account/passkeys/verify',
      passkeyOn,
      requireUser,
      validate('json', passkeyVerifyRequestSchema),
      async (c) => {
        const { challengeId, response } = c.req.valid('json');
        const p = take(challengeId, 'add');
        if (p.userId !== c.var.user.id) throw failed();
        const credential = await verifyRegistration(response, p.challenge);
        const id = db.transaction(() => {
          const id = insertPasskey(c, p.userId, credential);
          // The new passkey is on this device now.
          db.prepare('UPDATE sessions SET passkey_id = ? WHERE id = ?').run(
            id,
            c.var.sessionId,
          );
          return id;
        })();
        return c.json(passkeyById(c, id)!, 201);
      },
    )
    .patch(
      '/account/passkeys/:id',
      passkeyOn,
      requireUser,
      validate('json', passkeyRenameRequestSchema),
      (c) => {
        const id = passkeyId(c);
        const { changes } = db
          .prepare('UPDATE passkeys SET name = ? WHERE id = ? AND user_id = ?')
          .run(c.req.valid('json').name, id, c.var.user.id);
        if (!changes) throw new ApiError(404, 'not_found');
        return c.json(passkeyById(c, id)!);
      },
    )
    .delete('/account/passkeys/:id', passkeyOn, requireUser, (c) => {
      const id = passkeyId(c);
      const userId = c.var.user.id;
      db.transaction(() => {
        if (!passkeyById(c, id)) throw new ApiError(404, 'not_found');
        const { others } = db
          .prepare(
            'SELECT COUNT(*) AS others FROM passkeys WHERE user_id = ? AND id != ?',
          )
          .get(userId, id) as { others: number };
        // Only enabled methods count (AC-6.2, ADR-0003).
        const password =
          config.authMethods.includes('password') && !!passwordHash(userId);
        if (!others && !password) {
          throw new ApiError(409, 'last_sign_in_method');
        }
        // Sessions stay signed in (AC-6.3).
        db.prepare('DELETE FROM passkeys WHERE id = ?').run(id);
      })();
      return c.body(null, 204);
    });
}
