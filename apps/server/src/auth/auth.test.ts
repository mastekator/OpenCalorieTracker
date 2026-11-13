import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testApp } from '../test/app.js';
import { ensureAdmin } from './admin.js';
import { hashPassword } from './password.js';
import { RENEW_AFTER, SESSION_TTL } from './session.js';

const ADMIN = 'admin@example.com';
const PASSWORD = 'Correct-horse-battery-9';
const json = { 'content-type': 'application/json' };

async function setup(env: Record<string, string | undefined> = {}) {
  const t = testApp(env);
  await ensureAdmin(t.config, t.db);
  const call = (method: string, path: string, body?: unknown, cookie = '') =>
    t.app.request(path, {
      method,
      headers: { ...json, cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const login = (email = ADMIN, password = PASSWORD) =>
    call('POST', '/api/auth/login', { email, password });
  const signIn = async () => {
    const res = await login();
    expect(res.status).toBe(200);
    return res.headers.get('set-cookie')!.split(';')[0]!;
  };
  return { ...t, call, login, signIn };
}

let logs: string[];
beforeEach(() => {
  logs = [];
  for (const level of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('admin from env', () => {
  it('creates the admin on an empty database (AC-1.1)', async () => {
    const { db } = await setup();
    expect(
      db.prepare('SELECT email, role, password_from_config FROM users').all(),
    ).toEqual([{ email: ADMIN, role: 'admin', password_from_config: 1 }]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM passwords').get()).toEqual({
      n: 1,
    });
  });

  it.each([
    [{ ADMIN_EMAIL: 'not-an-email' }, 'admin_email_invalid'],
    [{ ADMIN_PASSWORD: 'password' }, 'admin_password_invalid'],
    [{ ADMIN_PASSWORD: ADMIN }, 'admin_password_invalid'],
    [{ ADMIN_PASSWORD: undefined }, 'admin_password_missing'],
  ])(
    'creates nobody and reports a setup error for %o (AC-1.3, AC-1.4)',
    async (env, error) => {
      const { db, call } = await setup(env);
      expect(db.prepare('SELECT 1 FROM users').get()).toBeUndefined();
      const body = (await (await call('GET', '/api/config')).json()) as {
        setupError: string;
      };
      expect(body.setupError).toBe(error);
    },
  );

  it('creates a passwordless admin when only passkeys are enabled', async () => {
    const { db } = await setup({
      AUTH_METHODS: 'passkey',
      ADMIN_PASSWORD: undefined,
    });
    expect(
      db.prepare('SELECT role, password_from_config FROM users').get(),
    ).toEqual({ role: 'admin', password_from_config: 0 });
    expect(db.prepare('SELECT 1 FROM passwords').get()).toBeUndefined();
  });

  it('never changes an existing admin, only warns (AC-1.6, E-1.1)', async () => {
    const { db, config } = await setup();
    const before = db.prepare('SELECT * FROM users').all();
    const hash = db.prepare('SELECT hash FROM passwords').get();
    await ensureAdmin(config, db);
    expect(logs.join('\n')).not.toMatch(/\[warn\]/);

    await ensureAdmin(
      {
        ...config,
        adminEmail: 'new@example.com',
        adminPassword: 'Other-pass-1',
      },
      db,
    );
    expect(db.prepare('SELECT * FROM users').all()).toEqual(before);
    expect(db.prepare('SELECT hash FROM passwords').get()).toEqual(hash);
    expect(logs.filter((l) => l.startsWith('[warn] ADMIN_'))).toHaveLength(2);
    expect(logs.join('\n')).not.toContain('Other-pass-1');
  });

  it('warns about users left without an enabled sign-in method (E-7.2)', async () => {
    const { db, config } = await setup();
    await ensureAdmin({ ...config, authMethods: ['passkey'] }, db);
    expect(logs).toContainEqual(expect.stringMatching(/^\[warn\] 1 user/));
  });

  it('has no HTTP route that creates a user (AC-1.2)', async () => {
    const { db, call } = await setup({ ADMIN_EMAIL: undefined });
    for (const path of [
      '/api/setup',
      '/api/admin',
      '/api/users',
      '/api/auth/register',
    ]) {
      await call('POST', path, { email: 'x@example.com', password: PASSWORD });
    }
    expect(db.prepare('SELECT 1 FROM users').get()).toBeUndefined();
  });
});

describe('sign-in', () => {
  it('signs in, sets a hardened cookie and returns the user', async () => {
    const { login, db } = await setup({
      PUBLIC_URL: 'https://food.example.com',
    });
    const res = await login(' Admin@Example.com ', PASSWORD);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: 1,
      email: ADMIN,
      name: null,
      role: 'admin',
      locale: 'en',
      theme: 'system',
      passwordFromConfig: true,
      methods: ['password'],
    });
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^oct_session=[\w-]{43};/);
    expect(cookie).toContain(`Max-Age=${SESSION_TTL / 1000}`);
    expect(cookie).toMatch(/HttpOnly; Secure; SameSite=Strict/);
    // Only the token hash is stored.
    const token = cookie.split(';')[0]!.split('=')[1]!;
    const stored = db.prepare('SELECT token_hash FROM sessions').get() as {
      token_hash: Buffer;
    };
    expect(stored.token_hash.toString('base64url')).not.toBe(token);
    expect(db.prepare('SELECT last_login_at FROM users').get()).toEqual({
      last_login_at: expect.any(Number),
    });
  });

  it('drops Secure only for a localhost PUBLIC_URL', async () => {
    const res = await (await setup()).login();
    expect(res.headers.get('set-cookie')).not.toContain('Secure');
  });

  it('answers alike for unknown email, wrong password and passkey-only users (AC-5.2)', async () => {
    const { login, db } = await setup();
    db.prepare(
      "INSERT INTO users (email, role, webauthn_user_id, created_at) VALUES ('pk@example.com', 'user', x'02', 0)",
    ).run();
    const answers = await Promise.all(
      [
        login('nobody@example.com', PASSWORD),
        login(ADMIN, 'Wrong-pass-1'),
        login('pk@example.com', PASSWORD),
      ].map(async (pending) => {
        const r = await pending;
        return [r.status, await r.json(), r.headers.get('set-cookie')];
      }),
    );
    for (const answer of answers) {
      expect(answer).toEqual([
        401,
        { error: { code: 'invalid_credentials' } },
        null,
      ]);
    }
  });

  it('spends a scrypt on unknown emails too (AC-5.2)', async () => {
    const { login } = await setup();
    const time = async (email: string) => {
      const start = performance.now();
      await login(email, 'Wrong-pass-1');
      return performance.now() - start;
    };
    await time('warmup@example.com');
    const unknown = await time('nobody@example.com');
    const known = await time(ADMIN);
    expect(unknown).toBeGreaterThan(known / 3);
  });

  it('is off with the password method disabled (AC-0.9)', async () => {
    const { login, call, db } = await setup({ AUTH_METHODS: 'passkey' });
    db.prepare(
      "INSERT INTO users (email, role, webauthn_user_id, created_at) VALUES ('u@example.com', 'user', x'02', 0)",
    ).run();
    db.prepare(
      "INSERT INTO passwords (user_id, hash, updated_at) SELECT id, ?, 0 FROM users WHERE email = 'u@example.com'",
    ).run(await hashPassword(PASSWORD, { N: 1024, r: 8, p: 1 }));
    const res = await login('u@example.com', PASSWORD);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: 'method_disabled' } });
    const put = await call('PUT', '/api/account/password', {
      newPassword: 'Pasta-2-go',
    });
    expect(put.status).toBe(403);
  });
});

describe('session', () => {
  it('serves /me, and logout ends it', async () => {
    const { call, signIn, db } = await setup();
    const cookie = await signIn();
    expect((await call('GET', '/api/auth/me', undefined, cookie)).status).toBe(
      200,
    );

    const out = await call('POST', '/api/auth/logout', undefined, cookie);
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toMatch(/^oct_session=;.*Max-Age=0/);
    expect(db.prepare('SELECT 1 FROM sessions').get()).toBeUndefined();
    expect((await call('GET', '/api/auth/me', undefined, cookie)).status).toBe(
      401,
    );
  });

  it('is 401 without a cookie or with a forged one', async () => {
    const { call } = await setup();
    for (const cookie of ['', 'oct_session=forged']) {
      const res = await call('GET', '/api/auth/me', undefined, cookie);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: { code: 'unauthenticated' } });
    }
  });

  it('slides the expiry at most once an hour and expires after 90 idle days (AC-5.4)', async () => {
    const { call, signIn, db } = await setup();
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = Date.now();
    const cookie = await signIn();
    const expires = () =>
      (
        db.prepare('SELECT expires_at FROM sessions').get() as {
          expires_at: number;
        }
      ).expires_at;
    const me = () => call('GET', '/api/auth/me', undefined, cookie);

    vi.setSystemTime(start + RENEW_AFTER - 1000);
    let res = await me();
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(expires()).toBe(start + SESSION_TTL);

    vi.setSystemTime(start + RENEW_AFTER);
    res = await me();
    expect(res.headers.get('set-cookie')).toMatch(/^oct_session=/);
    expect(expires()).toBe(start + RENEW_AFTER + SESSION_TTL);

    vi.setSystemTime(start + RENEW_AFTER + SESSION_TTL);
    expect((await me()).status).toBe(401);
  });

  it('dies with its user (E-5.4)', async () => {
    const { call, signIn, db } = await setup();
    const cookie = await signIn();
    db.prepare('DELETE FROM users').run();
    expect((await call('GET', '/api/auth/me', undefined, cookie)).status).toBe(
      401,
    );
  });
});

describe('PUT /api/account/password', () => {
  it('changes the password with the current one and clears passwordFromConfig (AC-1.7)', async () => {
    const { call, signIn, login } = await setup();
    const cookie = await signIn();
    const other = await signIn();
    const put = (body: unknown) =>
      call('PUT', '/api/account/password', body, cookie);

    expect((await put({ newPassword: 'Pasta-2-go' })).status).toBe(400);
    expect(
      await (
        await put({ currentPassword: 'Wrong-1!', newPassword: 'Pasta-2-go' })
      ).json(),
    ).toEqual({ error: { code: 'invalid_credentials' } });
    expect(
      await (
        await put({ currentPassword: PASSWORD, newPassword: 'pasta' })
      ).json(),
    ).toEqual({
      error: {
        code: 'password_invalid',
        details: ['length', 'digit', 'symbol'],
      },
    });

    expect(
      (await put({ currentPassword: PASSWORD, newPassword: 'Pasta-2-go' }))
        .status,
    ).toBe(204);
    expect((await login()).status).toBe(401);
    const res = await login(ADMIN, 'Pasta-2-go');
    expect(
      ((await res.json()) as { passwordFromConfig: boolean })
        .passwordFromConfig,
    ).toBe(false);
    // Other sessions survive (AC-6.3).
    expect((await call('GET', '/api/auth/me', undefined, other)).status).toBe(
      200,
    );
    expect(logs.join('\n')).not.toContain('Pasta-2-go');
  });

  it('sets a first password without a current one', async () => {
    const { call, signIn, db, login } = await setup();
    const cookie = await signIn();
    db.prepare('DELETE FROM passwords').run();
    const res = await call(
      'PUT',
      '/api/account/password',
      { newPassword: 'Pasta-2-go' },
      cookie,
    );
    expect(res.status).toBe(204);
    expect((await login(ADMIN, 'Pasta-2-go')).status).toBe(200);
  });
});
