import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { DEVICE_FAILS } from '../auth/guard.js';
import { setCookie, testApp } from '../test/app.js';
import {
  checkSetupCode,
  newSetupCode,
  SETUP_CODE_MAX_FAILS,
  SETUP_CODE_TTL,
} from './code.js';

vi.mock('@simplewebauthn/server', async (original) => ({
  ...(await original<typeof import('@simplewebauthn/server')>()),
  verifyRegistrationResponse: vi.fn(),
}));
const verifyReg = vi.mocked(verifyRegistrationResponse);

const wizardEnv = { ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined };
const EMAIL = 'owner@example.com';
const PASSWORD = 'Correct-horse-battery-9';
const answer = {
  id: 'cred-1',
  rawId: 'cred-1',
  type: 'public-key',
  response: {},
};

let logs: string[];
beforeEach(() => {
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...a) => {
    logs.push(a.join(' '));
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  verifyReg.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup(env: Record<string, string | undefined> = wizardEnv) {
  const t = testApp(env);
  const { code, expiresAt } = newSetupCode(t.db);
  /** A browser that keeps its device cookie. */
  const browser = (ip = '203.0.113.7') => {
    let jar = '';
    return async (path: string, body?: unknown) => {
      const res = await t.app.request(`/api/setup${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': ip,
          cookie: jar,
        },
        body: JSON.stringify(body ?? {}),
      });
      const device = setCookie(res, 'oct_device');
      if (device) jar = device.split(';')[0]!;
      return {
        status: res.status,
        body: await res.json().catch(() => null),
        session: setCookie(res, 'oct_session'),
      };
    };
  };
  const users = () =>
    t.db.prepare('SELECT email, role, password_from_config FROM users').all();
  const failCount = () =>
    (
      t.db.prepare('SELECT fail_count FROM setup_code').get() as
        { fail_count: number } | undefined
    )?.fail_count;
  const guardFails = () =>
    t.db
      .prepare("SELECT fail_count FROM login_guards WHERE kind = 'ip'")
      .get() as { fail_count: number } | undefined;
  return {
    ...t,
    code,
    expiresAt,
    call: browser(),
    browser,
    users,
    failCount,
    guardFails,
  };
}
const err = (code: string) => ({ error: { code } });

describe('POST /api/setup/code (ADR-0021 §3)', () => {
  it('accepts the right code in any case and spacing, and counts nothing', async () => {
    const t = setup();
    const res = await t.call('/code', { code: ` ${t.code.toLowerCase()} ` });
    expect(res.status).toBe(204);
    expect(t.failCount()).toBe(0);
    expect(t.guardFails()).toBeUndefined();
  });

  it('a wrong or missing code is a failure for the code and for the guard', async () => {
    const t = setup();
    for (const body of [{ code: 'AAAA-AAAA' }, { code: 'nonsense' }, {}]) {
      const res = await t.call('/code', body);
      expect(res).toMatchObject({
        status: 400,
        body: err('setup_code_invalid'),
      });
      expect(Object.keys(res.body)).toEqual(['error']);
    }
    expect(t.failCount()).toBe(3);
    expect(t.guardFails()).toEqual({ fail_count: 3 });
  });

  it('expired and burned codes are states, not attempts', async () => {
    const t = setup();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(t.expiresAt);
    expect(await t.call('/code', { code: t.code })).toMatchObject({
      status: 410,
      body: err('setup_code_expired'),
    });
    t.db
      .prepare('UPDATE setup_code SET expires_at = ?, fail_count = ?')
      .run(Date.now() + SETUP_CODE_TTL, SETUP_CODE_MAX_FAILS);
    expect(await t.call('/code', { code: t.code })).toMatchObject({
      status: 410,
      body: err('setup_code_burned'),
    });
    expect(t.guardFails()).toBeUndefined();
  });

  it('5 wrong codes from different addresses burn it', async () => {
    const t = setup();
    for (let i = 0; i < SETUP_CODE_MAX_FAILS; i++) {
      const res = await t.browser(`198.51.100.${i}`)('/code', {
        code: 'AAAA-AAAA',
      });
      expect(res.status).toBe(400);
    }
    expect(
      await t.browser('192.0.2.1')('/code', { code: t.code }),
    ).toMatchObject({ status: 410, body: err('setup_code_burned') });
  });

  it('the guard times the device out after its 5th wrong code', async () => {
    const t = setup();
    await t.call('/code', { code: t.code }); // the first answer gives the device its cookie
    for (let i = 0; i < DEVICE_FAILS; i++) await t.call('/code', { code: 'x' });
    expect(await t.call('/code', { code: 'x' })).toMatchObject({
      status: 429,
      body: { error: { code: 'too_many_attempts' } },
    });
  });
});

describe('POST /api/setup/admin (ADR-0021 §5)', () => {
  it('creates the one admin with a password, signs in, and closes the wizard', async () => {
    const t = setup();
    const res = await t.call('/admin', {
      code: t.code,
      email: ' Owner@Example.com ',
      name: 'Owner',
      password: PASSWORD,
      locale: 'ru',
    });
    expect(res.status).toBe(200);
    expect(res.session).toBeDefined();
    expect(res.body).toMatchObject({
      email: EMAIL,
      role: 'admin',
      locale: 'ru',
      passwordFromConfig: false,
      methods: ['password'],
    });
    expect(t.users()).toEqual([
      { email: EMAIL, role: 'admin', password_from_config: 0 },
    ]);
    expect(t.db.prepare('SELECT 1 FROM setup_code').get()).toBeUndefined();
    expect(logs).toContain('[info] admin account created in the setup wizard');
    expect(logs.join('\n')).not.toContain(EMAIL);

    const config = await t.app.request('/api/config');
    expect(await config.json()).toMatchObject({ setupRequired: false });
    for (const path of [
      '/code',
      '/admin',
      '/admin/passkey/options',
      '/admin/passkey/verify',
    ]) {
      expect(await t.call(path, { code: t.code })).toMatchObject({
        status: 409,
        body: err('setup_done'),
      });
    }
  });

  it('applies the password policy and leaves the code usable', async () => {
    const t = setup();
    for (const [password, code] of [['short', 'password_invalid']]) {
      const res = await t.call('/admin', {
        code: t.code,
        email: EMAIL,
        password,
      });
      expect(res).toMatchObject({ status: 400, body: { error: { code } } });
    }
    expect(t.users()).toEqual([]);
    expect(checkSetupCode(t.db, t.code)).toBe('ok');
  });

  it('refuses a call without the code and counts it as a failure', async () => {
    const t = setup();
    const res = await t.call('/admin', { email: EMAIL, password: PASSWORD });
    expect(res).toMatchObject({ status: 400, body: err('setup_code_invalid') });
    expect(t.users()).toEqual([]);
    expect(t.failCount()).toBe(1);
    expect(t.guardFails()).toEqual({ fail_count: 1 });
  });

  it('of two requests with the right code, one creates the admin and the other gets setup_done', async () => {
    const t = setup();
    const create = (email: string) =>
      t.browser()('/admin', { code: t.code, email, password: PASSWORD });
    const results = await Promise.all([
      create(EMAIL),
      create('other@example.com'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body).toEqual(
      err('setup_done'),
    );
    expect(t.users()).toHaveLength(1);
  });

  it('is disabled with the password method', async () => {
    const t = setup({ ...wizardEnv, AUTH_METHODS: 'passkey' });
    expect(
      await t.call('/admin', {
        code: t.code,
        email: EMAIL,
        password: PASSWORD,
      }),
    ).toMatchObject({ status: 403, body: err('method_disabled') });
  });
});

describe('passkey path (ADR-0021 §5)', () => {
  const options = (t: ReturnType<typeof setup>, code = t.code) =>
    t.call('/admin/passkey/options', { code, email: EMAIL, name: 'Owner' });

  it('creates the admin only after the authenticator answers', async () => {
    const t = setup();
    const opts = await options(t);
    expect(opts.status).toBe(200);
    expect(t.users()).toEqual([]);
    verifyReg.mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-1',
          publicKey: new Uint8Array([1]),
          counter: 0,
        },
      },
    } as never);
    const res = await t.call('/admin/passkey/verify', {
      challengeId: opts.body.challengeId,
      response: answer,
    });
    expect(res.status).toBe(200);
    expect(res.session).toBeDefined();
    expect(res.body).toMatchObject({ role: 'admin', methods: ['passkey'] });
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM passkeys').get()).toEqual({
      n: 1,
    });
    expect(t.db.prepare('SELECT 1 FROM setup_code').get()).toBeUndefined();
  });

  it('a wrong code at options is a failure', async () => {
    const t = setup();
    expect(await options(t, 'AAAA-AAAA')).toMatchObject({
      status: 400,
      body: err('setup_code_invalid'),
    });
    expect(t.failCount()).toBe(1);
  });

  it('a cancelled or failed ceremony writes nothing and the code still works', async () => {
    const t = setup();
    await options(t); // cancelled: verify is never called
    const opts = await options(t);
    verifyReg.mockResolvedValueOnce({ verified: false } as never);
    expect(
      await t.call('/admin/passkey/verify', {
        challengeId: opts.body.challengeId,
        response: answer,
      }),
    ).toMatchObject({ status: 400, body: err('passkey_failed') });
    expect(t.users()).toEqual([]);
    expect(checkSetupCode(t.db, t.code)).toBe('ok');
  });

  it('takes no challenge of another endpoint', async () => {
    const t = setup();
    const login = await t.app.request('/api/auth/passkey/login/options', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const { challengeId } = (await login.json()) as { challengeId: string };
    verifyReg.mockResolvedValue({ verified: true } as never);
    expect(
      await t.call('/admin/passkey/verify', { challengeId, response: answer }),
    ).toMatchObject({ status: 400, body: err('passkey_failed') });
    expect(verifyReg).not.toHaveBeenCalled();
    expect(t.users()).toEqual([]);
  });

  it('a code replaced between options and verify is refused', async () => {
    const t = setup();
    const opts = await options(t);
    newSetupCode(t.db); // a restart or reset-admin-access
    verifyReg.mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-1',
          publicKey: new Uint8Array([1]),
          counter: 0,
        },
      },
    } as never);
    expect(
      await t.call('/admin/passkey/verify', {
        challengeId: opts.body.challengeId,
        response: answer,
      }),
    ).toMatchObject({ status: 410, body: err('setup_code_expired') });
    expect(t.users()).toEqual([]);
  });

  it('is disabled with the passkey method', async () => {
    const t = setup({ ...wizardEnv, AUTH_METHODS: 'password' });
    expect(await options(t)).toMatchObject({
      status: 403,
      body: err('method_disabled'),
    });
  });
});

describe('outside wizard mode (ADR-0021 §1, §5)', () => {
  it('is 404 in a config install', async () => {
    const t = setup({});
    expect(await t.call('/code', { code: t.code })).toMatchObject({
      status: 404,
      body: err('not_found'),
    });
  });

  it('other account paths still refuse without an admin (OCT-142)', async () => {
    const t = setup({ ...wizardEnv, REGISTRATION: 'open' });
    const res = await t.app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(err('not_configured'));
    expect(t.users()).toEqual([]);
  });
});
