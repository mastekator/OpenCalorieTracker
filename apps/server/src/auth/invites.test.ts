import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCookie, testApp } from '../test/app.js';
import type { Database } from 'better-sqlite3';
import { ensureAdmin, resetAdminAccess } from './admin.js';
import { ADMIN_SETUP_TTL, LINK_TTL } from './invites.js';

const ADMIN = 'admin@example.com';
const PASSWORD = 'Correct-horse-battery-9';
const NEW_PASSWORD = 'Fresh-garden-path-4';

async function setup(env: Record<string, string | undefined> = {}) {
  const t = testApp(env);
  await ensureAdmin(t.config, t.db);
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    cookie = '',
  ) => {
    const res = await t.app.request(path, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const session = setCookie(res, 'oct_session')?.split(';')[0];
    return {
      status: res.status,
      body: await res.json().catch(() => null),
      session,
    };
  };
  const signIn = async (email = ADMIN, password = PASSWORD) =>
    (await call('POST', '/api/auth/login', { email, password })).session!;
  const admin = await signIn().catch(() => '');
  const invite = async (email: string) => {
    const res = await call('POST', '/api/admin/invites', { email }, admin);
    expect(res.status).toBe(201);
    return res.body as { id: number; url: string; expiresAt: number };
  };
  const token = (url: string) => url.split('#')[1]!;
  const check = async (t: string) =>
    (await call('POST', '/api/auth/invites/check', { token: t })).body;
  const register = (body: object) => call('POST', '/api/auth/register', body);
  const fails = () =>
    (
      t.db
        .prepare(
          "SELECT COALESCE(SUM(fail_count), 0) AS n FROM login_guards WHERE kind = 'ip'",
        )
        .get() as { n: number }
    ).n;
  return { ...t, call, signIn, admin, invite, token, check, register, fails };
}

let logs: string[];
beforeEach(() => {
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.join(' '));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('admin invites', () => {
  it('creates a 7-day link that only the create response carries', async () => {
    const { invite, call, admin, db } = await setup();
    const link = await invite(' New@Example.com ');
    expect(link.url).toMatch(/^http:\/\/localhost:3000\/invite#[\w-]{43}$/);
    expect(link.expiresAt - Date.now()).toBeGreaterThan(LINK_TTL - 5000);
    const list = await call('GET', '/api/admin/invites', undefined, admin);
    expect(list.body).toMatchObject([
      { id: link.id, email: 'new@example.com', status: 'pending' },
    ]);
    expect(JSON.stringify(list.body)).not.toContain(link.url.split('#')[1]);
    const { token_hash } = db
      .prepare('SELECT token_hash FROM invites')
      .get() as {
      token_hash: Buffer;
    };
    expect(token_hash).toHaveLength(32);
  });

  it('refuses a taken email and replaces a pending invite (AC-2.2)', async () => {
    const { invite, call, admin, check, token } = await setup();
    expect(
      (
        await call(
          'POST',
          '/api/admin/invites',
          { email: 'ADMIN@example.com' },
          admin,
        )
      ).body,
    ).toEqual({ error: { code: 'email_taken' } });
    const first = await invite('new@example.com');
    await invite('new@example.com');
    expect((await check(token(first.url))).status).toBe('invalid');
    const list = (await call('GET', '/api/admin/invites', undefined, admin))
      .body as { status: string }[];
    expect(list.map((i) => i.status)).toEqual(['pending', 'revoked']);
  });

  it('revokes a pending invite, which then reads as unknown (AC-2.7, E-4.4)', async () => {
    const { invite, call, admin, check, token, register } = await setup();
    const link = await invite('new@example.com');
    const revoke = `/api/admin/invites/${link.id}/revoke`;
    expect((await call('POST', revoke, undefined, admin)).status).toBe(204);
    expect(await check(token(link.url))).toEqual({
      kind: null,
      email: null,
      status: 'invalid',
    });
    expect((await call('POST', revoke, undefined, admin)).status).toBe(409);
    expect(
      (await call('POST', '/api/admin/invites/999/revoke', undefined, admin))
        .status,
    ).toBe(404);
    expect(
      (await register({ token: token(link.url), password: NEW_PASSWORD })).body,
    ).toEqual({ error: { code: 'invite_invalid' } });
  });

  it('answers 403 to a user and 401 to a guest on every admin route (AC-2.8)', async () => {
    const { invite, token, register, call } = await setup();
    const link = await invite('user@example.com');
    const user = (
      await register({ token: token(link.url), password: NEW_PASSWORD })
    ).session!;
    const routes: [string, string][] = [
      ['GET', '/api/admin/invites'],
      ['POST', '/api/admin/invites'],
      ['POST', `/api/admin/invites/${link.id}/revoke`],
      ['POST', '/api/admin/users/1/recovery-link'],
      ['GET', '/api/admin/anything'],
    ];
    for (const [method, path] of routes) {
      const body = method === 'POST' ? { email: 'x@example.com' } : undefined;
      expect((await call(method, path, body, user)).status, path).toBe(403);
      expect((await call(method, path, body)).status, path).toBe(401);
    }
  });
});

describe('invite check (E-4.1–E-4.4)', () => {
  it('tells valid, expired, used and invalid apart; only invalid counts as a failure', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { invite, token, check, register, fails } = await setup();
    const link = token((await invite('new@example.com')).url);
    expect(await check(link)).toEqual({
      kind: 'invite',
      email: 'new@example.com',
      status: 'valid',
    });

    const used = token((await invite('used@example.com')).url);
    expect(
      (await register({ token: used, password: NEW_PASSWORD })).status,
    ).toBe(200);
    expect(await check(used)).toEqual({
      kind: 'invite',
      email: null,
      status: 'used',
    });

    vi.setSystemTime(Date.now() + LINK_TTL);
    expect(await check(link)).toEqual({
      kind: 'invite',
      email: null,
      status: 'expired',
    });
    expect(fails()).toBe(0);

    expect((await check('made-up-token')).status).toBe('invalid');
    expect(fails()).toBe(1);
  });
});

describe('registration', () => {
  it('registers by invite, ignores a body email and signs in at once', async () => {
    const { invite, token, register, call, db } = await setup();
    const res = await register({
      token: token((await invite('new@example.com')).url),
      email: 'other@example.com',
      name: ' Ann ',
      password: NEW_PASSWORD,
      locale: 'ru',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: 'new@example.com',
      name: 'Ann',
      role: 'user',
      locale: 'ru',
      methods: ['password'],
    });
    expect(
      (await call('GET', '/api/auth/me', undefined, res.session)).status,
    ).toBe(200);
    expect(
      db
        .prepare(
          "SELECT last_login_at IS NOT NULL AS seen FROM users WHERE email = 'new@example.com'",
        )
        .get(),
    ).toEqual({ seen: 1 });
  });

  it('refuses a used invite (AC-2.4)', async () => {
    const { invite, token, register } = await setup();
    const t = token((await invite('new@example.com')).url);
    expect((await register({ token: t, password: NEW_PASSWORD })).status).toBe(
      200,
    );
    expect((await register({ token: t, password: NEW_PASSWORD })).body).toEqual(
      {
        error: { code: 'invite_used' },
      },
    );
  });

  it('lets exactly one of two concurrent registrations win (E-3.3)', async () => {
    const { invite, token, register, db } = await setup();
    const t = token((await invite('new@example.com')).url);
    const results = await Promise.all([
      register({ token: t, password: NEW_PASSWORD }),
      register({ token: t, password: 'Other-garden-path-5' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({
      n: 2,
    });
  });

  it('re-checks the invite after the form is filled in (AC-3.4)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { invite, token, check, register, call, admin } = await setup();
    const revoked = await invite('a@example.com');
    const expiring = token((await invite('b@example.com')).url);
    expect((await check(token(revoked.url))).status).toBe('valid');
    await call(
      'POST',
      `/api/admin/invites/${revoked.id}/revoke`,
      undefined,
      admin,
    );
    expect(
      (await register({ token: token(revoked.url), password: NEW_PASSWORD }))
        .status,
    ).toBe(400);

    expect((await check(expiring)).status).toBe('valid');
    vi.setSystemTime(Date.now() + LINK_TTL);
    expect(
      (await register({ token: expiring, password: NEW_PASSWORD })).body,
    ).toEqual({
      error: { code: 'invite_expired' },
    });
  });

  it('needs an invite unless registration is open (AC-3.5)', async () => {
    const { register, db } = await setup();
    const res = await register({
      email: 'new@example.com',
      password: NEW_PASSWORD,
    });
    expect(res.body).toEqual({ error: { code: 'invite_invalid' } });
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({
      n: 1,
    });
  });

  it('checks the password policy against the invited email', async () => {
    const { invite, token, register } = await setup();
    const res = await register({
      token: token((await invite('new@example.com')).url),
      password: 'short',
    });
    expect(res.body).toMatchObject({ error: { code: 'password_invalid' } });
  });

  describe('open (AC-3.6)', () => {
    it('registers without a token', async () => {
      const { register } = await setup({ REGISTRATION: 'open' });
      const res = await register({
        email: ' New@Example.com ',
        password: NEW_PASSWORD,
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ email: 'new@example.com' });
    });

    it('gives a taken email or one with a pending invite the same vague answer and counts it', async () => {
      const { register, invite, fails } = await setup({ REGISTRATION: 'open' });
      await invite('invited@example.com');
      for (const email of ['ADMIN@example.com', 'invited@example.com']) {
        expect(
          (await register({ email, password: NEW_PASSWORD })).body,
        ).toEqual({
          error: { code: 'registration_failed' },
        });
      }
      expect(fails()).toBe(2);
    });
  });
});

describe('recovery (AC-6.4)', () => {
  it('sets a new password, keeps data and signs in', async () => {
    const { call, admin, token, check, db, signIn } = await setup();
    db.prepare("UPDATE users SET name = 'Boss'").run();
    const link = await call(
      'POST',
      '/api/admin/users/1/recovery-link',
      undefined,
      admin,
    );
    expect(link.status).toBe(201);
    const t = token((link.body as { url: string }).url);
    expect((link.body as { url: string }).url).toContain('/recover#');
    expect(await check(t)).toEqual({
      kind: 'recovery',
      email: ADMIN,
      status: 'valid',
    });

    const res = await call('POST', '/api/auth/recover', {
      token: t,
      password: NEW_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: ADMIN,
      name: 'Boss',
      passwordFromConfig: false,
    });
    // Other sessions stay (AC-6.3).
    expect((await call('GET', '/api/auth/me', undefined, admin)).status).toBe(
      200,
    );
    expect(await signIn(ADMIN, NEW_PASSWORD)).toBeTruthy();
    expect(
      (
        await call('POST', '/api/auth/recover', {
          token: t,
          password: NEW_PASSWORD,
        })
      ).status,
    ).toBe(409);
  });

  it('a new recovery link revokes the pending one; invites do not work as recovery', async () => {
    const { call, admin, token, check, invite } = await setup();
    const first = await call(
      'POST',
      '/api/admin/users/1/recovery-link',
      undefined,
      admin,
    );
    await call('POST', '/api/admin/users/1/recovery-link', undefined, admin);
    expect(
      (await check(token((first.body as { url: string }).url))).status,
    ).toBe('invalid');
    expect(
      (
        await call(
          'POST',
          '/api/admin/users/42/recovery-link',
          undefined,
          admin,
        )
      ).status,
    ).toBe(404);
    const inv = token((await invite('new@example.com')).url);
    expect(
      (
        await call('POST', '/api/auth/recover', {
          token: inv,
          password: NEW_PASSWORD,
        })
      ).body,
    ).toEqual({
      error: { code: 'invite_invalid' },
    });
  });
});

describe('admin passkey setup link (AC-1.5)', () => {
  const passkeyOnly = { AUTH_METHODS: 'passkey', ADMIN_PASSWORD: undefined };
  const setupLinks = () => logs.filter((l) => l.startsWith('[setup]'));

  it('logs a working 24-hour link, again only after it expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { config, db, check } = await setup(passkeyOnly);
    expect(setupLinks()).toHaveLength(1);
    const url = setupLinks()[0]!.match(/(http\S+)$/)![1]!;
    expect(url).toMatch(/\/recover#/);
    expect(await check(url.split('#')[1]!)).toEqual({
      kind: 'recovery',
      email: ADMIN,
      status: 'valid',
    });

    await ensureAdmin(config, db);
    expect(setupLinks()).toHaveLength(1);
    vi.setSystemTime(Date.now() + ADMIN_SETUP_TTL);
    await ensureAdmin(config, db);
    expect(setupLinks()).toHaveLength(2);
  });

  it('logs nothing when passwords are enabled', async () => {
    await setup();
    expect(setupLinks()).toHaveLength(0);
  });
});

describe('reset-admin-access (E-6.2)', () => {
  const block = (db: Database) =>
    db
      .prepare(
        `INSERT INTO login_guards (kind, ip, device_id, blocked_at, timeout_until)
         VALUES ('ip', '203.0.113.7', '', 1, NULL), ('device', '203.0.113.7', 'd1', NULL, ?)`,
      )
      .run(Date.now() + 60_000);

  it('lifts every block and prints a working 24-hour link that revokes the previous one', async () => {
    const { config, db, call, admin, token } = await setup();
    block(db);
    const old = await call(
      'POST',
      '/api/admin/users/1/recovery-link',
      undefined,
      admin,
    );
    const { cleared, url, expiresAt } = resetAdminAccess(config, db);
    expect(cleared).toBe(2);
    expect(db.prepare('SELECT COUNT(*) AS n FROM login_guards').get()).toEqual({
      n: 0,
    });
    expect(expiresAt - Date.now()).toBeGreaterThan(ADMIN_SETUP_TTL - 60_000);
    expect(
      (
        await call('POST', '/api/auth/recover', {
          token: token((old.body as { url: string }).url),
          password: NEW_PASSWORD,
        })
      ).status,
    ).toBe(400);
    const res = await call('POST', '/api/auth/recover', {
      token: token(url),
      password: NEW_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: ADMIN });
  });

  it('still lifts blocks when the link cannot be made', async () => {
    const { config, db } = await setup();
    block(db);
    expect(() => resetAdminAccess({ ...config, publicUrl: null }, db)).toThrow(
      /PUBLIC_URL/,
    );
    db.prepare('DELETE FROM users').run();
    block(db);
    expect(() => resetAdminAccess(config, db)).toThrow(/no admin/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM login_guards').get()).toEqual({
      n: 0,
    });
  });
});
