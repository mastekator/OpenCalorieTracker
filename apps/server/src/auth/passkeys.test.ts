import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { setCookie, testApp } from '../test/app.js';
import { ensureAdmin } from './admin.js';
import { CHALLENGE_TTL, MAX_CHALLENGES, challengeStore } from './challenges.js';
import { IP_FAILS } from './guard.js';
import { passkeyName } from './passkeys.js';

// Real options generation; the authenticator's answers are faked by mocking the two verify calls.
vi.mock('@simplewebauthn/server', async (original) => ({
  ...(await original<typeof import('@simplewebauthn/server')>()),
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));
const verifyReg = vi.mocked(verifyRegistrationResponse);
const verifyAuth = vi.mocked(verifyAuthenticationResponse);

const ADMIN = 'admin@example.com';
const PASSWORD = 'Correct-horse-battery-9';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** The authenticator creates this credential on the next registration. */
const creates = (id: string) =>
  verifyReg.mockResolvedValueOnce({
    verified: true,
    registrationInfo: {
      credential: {
        id,
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
        transports: ['internal'],
      },
    },
  } as never);
const answer = (id: string, userHandle?: string) => ({
  id,
  rawId: id,
  type: 'public-key',
  response: { userHandle },
  clientExtensionResults: {},
});

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
      headers: {
        'content-type': 'application/json',
        'user-agent': IPHONE,
        cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: res.status,
      body: await res.json().catch(() => null),
      session: setCookie(res, 'oct_session')?.split(';')[0],
    };
  };
  const ceremony = async (
    path: string,
    body: object | undefined,
    response: object,
    cookie = '',
  ) => {
    const options = await call('POST', `${path}/options`, body, cookie);
    expect(options.status).toBe(200);
    return call(
      'POST',
      `${path}/verify`,
      { challengeId: options.body.challengeId, response },
      cookie,
    );
  };
  const link = async (kind: 'invites' | 'recovery', email: string) => {
    const admin = (
      await call('POST', '/api/auth/login', {
        email: ADMIN,
        password: PASSWORD,
      })
    ).session!;
    const path =
      kind === 'invites'
        ? '/api/admin/invites'
        : `/api/admin/users/${userId(email)}/recovery-link`;
    const res = await call(
      'POST',
      path,
      kind === 'invites' ? { email } : undefined,
      admin,
    );
    expect(res.status).toBe(201);
    return (res.body.url as string).split('#')[1]!;
  };
  const userId = (email: string) =>
    (
      t.db.prepare('SELECT id FROM users WHERE email = ?').get(email) as
        { id: number } | undefined
    )?.id;
  const handle = (email: string) =>
    (
      t.db
        .prepare('SELECT webauthn_user_id FROM users WHERE email = ?')
        .get(email) as { webauthn_user_id: Buffer }
    ).webauthn_user_id.toString('base64url');
  /** Adds a passkey to an existing user through "My passkeys". */
  const addPasskey = async (session: string, id: string) => {
    creates(id);
    const res = await ceremony(
      '/api/account/passkeys',
      undefined,
      answer(id),
      session,
    );
    expect(res.status).toBe(201);
    return res.body as { id: number; name: string };
  };
  const count = (table: string) =>
    (t.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number })
      .n;
  return { ...t, call, ceremony, link, userId, handle, addPasskey, count };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  verifyReg.mockReset();
  verifyAuth.mockReset();
  vi.useRealTimers();
});

describe('passkey sign-in', () => {
  it('signs in without an email and updates the counter', async () => {
    const t = await setup();
    const admin = (
      await t.call('POST', '/api/auth/login', {
        email: ADMIN,
        password: PASSWORD,
      })
    ).session!;
    await t.addPasskey(admin, 'cred0001');

    const options = await t.call('POST', '/api/auth/passkey/login/options');
    expect(options.body.options.rpId).toBe('localhost');
    expect(options.body.options.allowCredentials ?? []).toEqual([]);
    verifyAuth.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: { newCounter: 7 },
    } as never);
    const res = await t.call('POST', '/api/auth/passkey/login/verify', {
      challengeId: options.body.challengeId,
      response: answer('cred0001', t.handle(ADMIN)),
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: ADMIN,
      methods: ['password', 'passkey'],
    });
    expect(res.session).toBeTruthy();
    // "This device" follows the session's passkey, not the user's.
    expect(
      (await t.call('GET', '/api/account/passkeys', undefined, res.session))
        .body,
    ).toMatchObject([{ thisDevice: true }]);
    const other = (
      await t.call('POST', '/api/auth/login', {
        email: ADMIN,
        password: PASSWORD,
      })
    ).session!;
    expect(
      (await t.call('GET', '/api/account/passkeys', undefined, other)).body,
    ).toMatchObject([{ thisDevice: false }]);
    expect(verifyAuth.mock.calls[0]![0]).toMatchObject({
      expectedOrigin: 'http://localhost:3000',
      expectedRPID: 'localhost',
      expectedChallenge: options.body.options.challenge,
    });
    expect(
      t.db.prepare('SELECT counter, last_used_at FROM passkeys').get(),
    ).toMatchObject({ counter: 7, last_used_at: expect.any(Number) });

    // The challenge is one-time.
    const again = await t.call('POST', '/api/auth/passkey/login/verify', {
      challengeId: options.body.challengeId,
      response: answer('cred0001', t.handle(ADMIN)),
    });
    expect(again.body.error.code).toBe('passkey_failed');
  });

  it('answers passkey_unknown for an unknown credential or a foreign user handle (E-5.3)', async () => {
    const t = await setup();
    const admin = (
      await t.call('POST', '/api/auth/login', {
        email: ADMIN,
        password: PASSWORD,
      })
    ).session!;
    await t.addPasskey(admin, 'cred0001');
    for (const response of [
      answer('credXXXX', t.handle(ADMIN)),
      answer('cred0001', 'AAAA'),
      answer('cred0001'),
    ]) {
      const res = await t.ceremony(
        '/api/auth/passkey/login',
        undefined,
        response,
      );
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('passkey_unknown');
    }
    expect(verifyAuth).not.toHaveBeenCalled();
  });

  it('rejects an answer the authenticator check refuses', async () => {
    const t = await setup();
    const admin = (
      await t.call('POST', '/api/auth/login', {
        email: ADMIN,
        password: PASSWORD,
      })
    ).session!;
    await t.addPasskey(admin, 'cred0001');
    verifyAuth.mockRejectedValueOnce(new Error('bad signature'));
    const res = await t.ceremony(
      '/api/auth/passkey/login',
      undefined,
      answer('cred0001', t.handle(ADMIN)),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('passkey_failed');
    expect(res.session).toBeUndefined();
  });

  it('works from an IP the guard has timed out (AC-5.10)', async () => {
    const t = await setup();
    const admin = (
      await t.call('POST', '/api/auth/login', {
        email: ADMIN,
        password: PASSWORD,
      })
    ).session!;
    await t.addPasskey(admin, 'cred0001');
    for (let i = 0; i < IP_FAILS; i++) {
      await t.call('POST', '/api/auth/login', {
        email: ADMIN,
        password: 'nope',
      });
    }
    const blocked = await t.call('POST', '/api/auth/login', {
      email: ADMIN,
      password: PASSWORD,
    });
    expect(blocked.status).toBe(429);
    verifyAuth.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    } as never);
    const res = await t.ceremony(
      '/api/auth/passkey/login',
      undefined,
      answer('cred0001', t.handle(ADMIN)),
    );
    expect(res.status).toBe(200);
  });
});

describe('registration with a passkey', () => {
  it('creates the user and the passkey from an invite', async () => {
    const t = await setup();
    const token = await t.link('invites', 'new@example.com');
    creates('credNEW0');
    const res = await t.ceremony(
      '/api/auth/register/passkey',
      { token, name: 'Ann', locale: 'ru', email: 'ignored@example.com' },
      answer('credNEW0'),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: 'new@example.com',
      name: 'Ann',
      locale: 'ru',
      methods: ['passkey'],
    });
    expect(res.session).toBeTruthy();
    const pk = t.db
      .prepare('SELECT name, credential_id, transports FROM passkeys')
      .get() as { name: string; credential_id: Buffer; transports: string };
    expect(pk.name).toBe('iPhone · Safari');
    expect(pk.credential_id.toString('base64url')).toBe('credNEW0');
    expect(JSON.parse(pk.transports)).toEqual(['internal']);
  });

  it('leaves nothing behind when the dialog is cancelled or the check fails (E-3.2)', async () => {
    const t = await setup();
    const token = await t.link('invites', 'new@example.com');
    // Cancelled: options only, no verify.
    await t.call('POST', '/api/auth/register/passkey/options', { token });
    verifyReg.mockRejectedValueOnce(new Error('bad attestation'));
    const res = await t.ceremony(
      '/api/auth/register/passkey',
      { token },
      answer('credNEW0'),
    );
    expect(res.body.error.code).toBe('passkey_failed');
    expect(t.userId('new@example.com')).toBeUndefined();
    expect(t.count('passkeys')).toBe(0);
    // The invite still works.
    creates('credNEW0');
    const ok = await t.ceremony(
      '/api/auth/register/passkey',
      { token },
      answer('credNEW0'),
    );
    expect(ok.status).toBe(200);
  });

  it('lets only one of two concurrent registrations use the invite (E-3.3)', async () => {
    const t = await setup();
    const token = await t.link('invites', 'new@example.com');
    const a = await t.call('POST', '/api/auth/register/passkey/options', {
      token,
    });
    const b = await t.call('POST', '/api/auth/register/passkey/options', {
      token,
    });
    creates('credAAAA');
    creates('credBBBB');
    const first = await t.call('POST', '/api/auth/register/passkey/verify', {
      challengeId: a.body.challengeId,
      response: answer('credAAAA'),
    });
    const second = await t.call('POST', '/api/auth/register/passkey/verify', {
      challengeId: b.body.challengeId,
      response: answer('credBBBB'),
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('invite_used');
    expect(t.count('passkeys')).toBe(1);
  });

  it('needs an invite unless registration is open (AC-3.5)', async () => {
    const t = await setup();
    const res = await t.call('POST', '/api/auth/register/passkey/options', {
      email: 'x@example.com',
    });
    expect(res.status).toBe(403);
  });

  it('refuses a taken email in open registration before the dialog (AC-3.6)', async () => {
    const t = await setup({ REGISTRATION: 'open' });
    const res = await t.call('POST', '/api/auth/register/passkey/options', {
      email: ADMIN,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('registration_failed');

    // Taken between options and verify: the transaction catches it too.
    const options = await t.call('POST', '/api/auth/register/passkey/options', {
      email: 'late@example.com',
    });
    t.db
      .prepare(
        `INSERT INTO users (email, role, webauthn_user_id, created_at)
         VALUES ('late@example.com', 'user', randomblob(16), 0)`,
      )
      .run();
    creates('credLATE');
    const verify = await t.call('POST', '/api/auth/register/passkey/verify', {
      challengeId: options.body.challengeId,
      response: answer('credLATE'),
    });
    expect(verify.status).toBe(409);
    expect(verify.body.error.code).toBe('registration_failed');
    expect(t.count('passkeys')).toBe(0);
  });

  it('does not accept a challenge from another endpoint', async () => {
    const t = await setup();
    const login = await t.call('POST', '/api/auth/passkey/login/options');
    creates('credNEW0');
    const res = await t.call('POST', '/api/auth/register/passkey/verify', {
      challengeId: login.body.challengeId,
      response: answer('credNEW0'),
    });
    expect(res.body.error.code).toBe('passkey_failed');
  });
});

describe('recovery with a passkey', () => {
  it('adds a passkey and keeps the old ones (AC-6.4)', async () => {
    const t = await setup();
    const admin = (
      await t.call('POST', '/api/auth/login', {
        email: ADMIN,
        password: PASSWORD,
      })
    ).session!;
    await t.addPasskey(admin, 'credOLD0');
    const token = await t.link('recovery', ADMIN);
    const options = await t.call('POST', '/api/auth/recover/passkey/options', {
      token,
    });
    expect(options.body.options.excludeCredentials).toMatchObject([
      { id: 'credOLD0' },
    ]);
    expect(options.body.options.user.id).toBe(t.handle(ADMIN));
    creates('credNEW0');
    const res = await t.call('POST', '/api/auth/recover/passkey/verify', {
      challengeId: options.body.challengeId,
      response: answer('credNEW0'),
    });
    expect(res.status).toBe(200);
    expect(res.session).toBeTruthy();
    expect(t.count('passkeys')).toBe(2);
    const used = await t.call('POST', '/api/auth/recover/passkey/options', {
      token,
    });
    expect(used.body.error.code).toBe('invite_used');
  });

  it('sets up the first admin passkey from the setup link (AC-1.5)', async () => {
    const t = testApp({ AUTH_METHODS: 'passkey', ADMIN_PASSWORD: undefined });
    let url = '';
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      url = /(http\S+)/.exec(line)?.[1] ?? url;
    });
    await ensureAdmin(t.config, t.db);
    const token = url.split('#')[1]!;
    const options = await t.app.request('/api/auth/recover/passkey/options', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const { challengeId } = (await options.json()) as { challengeId: string };
    creates('credADMN');
    const res = await t.app.request('/api/auth/recover/passkey/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId, response: answer('credADMN') }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      email: ADMIN,
      role: 'admin',
      methods: ['passkey'],
    });
    expect(setCookie(res, 'oct_session')).toBeTruthy();
  });
});

describe('my passkeys', () => {
  it('lists, renames and deletes, leaving sessions alone (AC-6.3)', async () => {
    const t = await setup();
    const admin = (
      await t.call('POST', '/api/auth/login', {
        email: ADMIN,
        password: PASSWORD,
      })
    ).session!;
    const added = await t.addPasskey(admin, 'cred0001');
    expect(added.name).toBe('iPhone · Safari');
    const renamed = await t.call(
      'PATCH',
      `/api/account/passkeys/${added.id}`,
      { name: '  Work phone ' },
      admin,
    );
    expect(renamed.body.name).toBe('Work phone');
    const list = await t.call('GET', '/api/account/passkeys', undefined, admin);
    expect(list.body).toMatchObject([
      { id: added.id, name: 'Work phone', lastUsedAt: null, thisDevice: true },
    ]);
    const second = await t.addPasskey(admin, 'cred0002');
    const del = await t.call(
      'DELETE',
      `/api/account/passkeys/${added.id}`,
      undefined,
      admin,
    );
    expect(del.status).toBe(204);
    // The badge moved to the passkey added last; deleting it keeps the session (AC-6.3).
    expect(
      (await t.call('GET', '/api/account/passkeys', undefined, admin)).body,
    ).toMatchObject([{ id: second.id, thisDevice: true }]);
    await t.call(
      'DELETE',
      `/api/account/passkeys/${second.id}`,
      undefined,
      admin,
    );
    expect(t.count('passkeys')).toBe(0);
    expect(
      t.db.prepare('SELECT passkey_id FROM sessions').pluck().all(),
    ).toEqual([null]);
    expect((await t.call('GET', '/api/auth/me', undefined, admin)).status).toBe(
      200,
    );
  });

  it('refuses to delete the last enabled sign-in method (AC-6.2)', async () => {
    const t = await setup();
    const token = await t.link('invites', 'pk@example.com');
    creates('cred0001');
    const user = (
      await t.ceremony(
        '/api/auth/register/passkey',
        { token },
        answer('cred0001'),
      )
    ).session!;
    const [only] = (
      await t.call('GET', '/api/account/passkeys', undefined, user)
    ).body as { id: number; thisDevice: boolean }[];
    expect(only!.thisDevice).toBe(true);
    const res = await t.call(
      'DELETE',
      `/api/account/passkeys/${only!.id}`,
      undefined,
      user,
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('last_sign_in_method');

    // With a second passkey the first one can go.
    await t.addPasskey(user, 'cred0002');
    const ok = await t.call(
      'DELETE',
      `/api/account/passkeys/${only!.id}`,
      undefined,
      user,
    );
    expect(ok.status).toBe(204);
  });

  it('counts a password only while password sign-in is enabled', async () => {
    const t = await setup();
    const admin = (
      await t.call('POST', '/api/auth/login', {
        email: ADMIN,
        password: PASSWORD,
      })
    ).session!;
    const pk = await t.addPasskey(admin, 'cred0001');
    // Same database, password sign-in switched off.
    const { createApp } = await import('../app.js');
    const { loadConfig } = await import('../config.js');
    const off = createApp({
      db: t.db,
      config: loadConfig({
        PUBLIC_URL: 'http://localhost:3000',
        ADMIN_EMAIL: ADMIN,
        AUTH_METHODS: 'passkey',
      }),
    });
    const res = await off.request(`/api/account/passkeys/${pk.id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie: admin },
    });
    expect(await res.json()).toMatchObject({
      error: { code: 'last_sign_in_method' },
    });
    // With password sign-in on, the password is enough.
    const ok = await t.call(
      'DELETE',
      `/api/account/passkeys/${pk.id}`,
      undefined,
      admin,
    );
    expect(ok.status).toBe(204);
  });

  it("hides other users' passkeys", async () => {
    const t = await setup();
    const admin = (
      await t.call('POST', '/api/auth/login', {
        email: ADMIN,
        password: PASSWORD,
      })
    ).session!;
    const token = await t.link('invites', 'pk@example.com');
    creates('cred0001');
    await t.ceremony(
      '/api/auth/register/passkey',
      { token },
      answer('cred0001'),
    );
    const theirs = t.db.prepare('SELECT id FROM passkeys').get() as {
      id: number;
    };
    for (const [method, body] of [
      ['PATCH', { name: 'Mine' }],
      ['DELETE', undefined],
    ] as const) {
      const res = await t.call(
        method,
        `/api/account/passkeys/${theirs.id}`,
        body,
        admin,
      );
      expect(res.status).toBe(404);
    }
    expect(
      (await t.call('GET', '/api/account/passkeys', undefined, admin)).body,
    ).toEqual([]);
  });

  it('needs a session', async () => {
    const t = await setup();
    expect((await t.call('GET', '/api/account/passkeys')).status).toBe(401);
    expect((await t.call('POST', '/api/account/passkeys/options')).status).toBe(
      401,
    );
  });
});

it('answers method_disabled on every passkey endpoint when passkeys are off (AC-0.9)', async () => {
  const t = await setup({ AUTH_METHODS: 'password' });
  const admin = (
    await t.call('POST', '/api/auth/login', {
      email: ADMIN,
      password: PASSWORD,
    })
  ).session!;
  const verify = { challengeId: 'x', response: answer('x') };
  for (const [method, path, body] of [
    ['POST', '/api/auth/passkey/login/options', undefined],
    ['POST', '/api/auth/passkey/login/verify', verify],
    ['POST', '/api/auth/register/passkey/options', { token: 'x' }],
    ['POST', '/api/auth/register/passkey/verify', verify],
    ['POST', '/api/auth/recover/passkey/options', { token: 'x' }],
    ['POST', '/api/auth/recover/passkey/verify', verify],
    ['GET', '/api/account/passkeys', undefined],
    ['POST', '/api/account/passkeys/options', undefined],
    ['POST', '/api/account/passkeys/verify', verify],
    ['PATCH', '/api/account/passkeys/1', { name: 'x' }],
    ['DELETE', '/api/account/passkeys/1', undefined],
  ] as const) {
    const res = await t.call(method, path, body, admin);
    expect([path, res.status, res.body?.error.code]).toEqual([
      path,
      403,
      'method_disabled',
    ]);
  }
});

describe('challengeStore', () => {
  it('gives each challenge once and forgets it after the TTL', () => {
    vi.useFakeTimers();
    const store = challengeStore<string>();
    const a = store.put('a');
    expect(store.take(a)).toBe('a');
    expect(store.take(a)).toBeUndefined();
    const b = store.put('b');
    vi.advanceTimersByTime(CHALLENGE_TTL);
    expect(store.take(b)).toBeUndefined();
  });

  it('drops the oldest entry when full', () => {
    const store = challengeStore<number>();
    const first = store.put(0);
    const second = store.put(1);
    for (let i = 2; i <= MAX_CHALLENGES; i++) store.put(i);
    expect(store.take(first)).toBeUndefined();
    expect(store.take(second)).toBe(1);
  });
});

it.each([
  [IPHONE, 'iPhone · Safari'],
  [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mac · Chrome',
  ],
  [
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    'Android · Chrome',
  ],
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    'Windows · Edge',
  ],
  [
    'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
    'Linux · Firefox',
  ],
  ['curl/8.0', 'Passkey'],
  [undefined, 'Passkey'],
])('names a passkey after %s', (ua, name) => {
  expect(passkeyName(ua)).toBe(name);
});
