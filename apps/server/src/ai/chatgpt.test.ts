import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from '../db/migrate.js';
import { openDb } from '../db/open.js';
import { secretsFrom } from '../secrets.js';
import { aiSetup, mockModel } from '../test/ai.js';
import { aiResultOf } from './status.js';
import {
  ACCESS_PURPOSE,
  AUTHORIZE_URL,
  createChatgptAuth,
  REDIRECT_URI,
  REFRESH_PURPOSE,
  REVOKE_URL,
  STATE_TTL_MS,
  TOKEN_URL,
} from './chatgpt.js';

const CLIENT = 'oaiapp_test';
const idToken = (claims: object) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

let log: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

/** Every token the fake OpenAI handed out, to look for in logs and responses. */
const issued: string[] = [];
const tokens = (n: number, extra: object = {}) => {
  issued.push(`access-${n}`, `refresh-${n}`);
  return {
    access_token: `access-${n}`,
    refresh_token: `refresh-${n}`,
    expires_in: 3600,
    token_type: 'Bearer',
    ...extra,
  };
};

function setup() {
  let clock = 1_000_000;
  const db = openDb(':memory:');
  migrate(db);
  const secrets = secretsFrom(randomBytes(32));
  const calls: { url: string; body: URLSearchParams }[] = [];
  let answer: (body: URLSearchParams) => Response | Promise<Response> = () =>
    json({ error: 'unexpected' }, 500);
  const fetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body as URLSearchParams;
      calls.push({ url: String(url), body });
      return answer(body);
    },
  ) as unknown as typeof globalThis.fetch;
  const auth = createChatgptAuth({ db, secrets, fetch, now: () => clock });
  const callback = (url: string, extra: Record<string, string> = {}) => {
    const state = new URL(url).searchParams.get('state')!;
    return `${REDIRECT_URI}?${new URLSearchParams({ code: 'the-code', state, scope: 'x', ...extra })}`;
  };
  const nonce = (url: string) => new URL(url).searchParams.get('nonce');
  const row = () =>
    db.prepare('SELECT * FROM chatgpt_auth').get() as
      Record<string, unknown> | undefined;
  /** Signs in with tokens 1, expiring in an hour. */
  const signIn = async () => {
    const url = auth.start();
    answer = () =>
      json(
        tokens(1, {
          id_token: idToken({ nonce: nonce(url), email: 'a@example.com' }),
        }),
      );
    return auth.finish(callback(url, { client_id: CLIENT }));
  };
  return {
    db,
    secrets,
    auth,
    calls,
    callback,
    nonce,
    row,
    signIn,
    answer: (fn: typeof answer) => (answer = fn),
    tick: (ms: number) => (clock += ms),
  };
}

describe('start', () => {
  it('builds the PKCE address with a dynamic client and the host id on first sign-in', () => {
    const t = setup();
    const url = new URL(t.auth.start());
    const hostId = (
      t.db.prepare('SELECT host_id FROM instance_ai').get() as {
        host_id: string;
      }
    ).host_id;
    expect(`${url.origin}${url.pathname}`).toBe(AUTHORIZE_URL);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: 'dynamic_agent_client',
      redirect_uri: 'http://127.0.0.1:1459/auth/callback',
      agent_name_hint: 'OpenCalorieTracker',
      ext_agent_host_id: `urn:uuid:${hostId}`,
      code_challenge_method: 'S256',
      resource: 'https://api.openai.com/v1',
    });
    expect(url.searchParams.get('scope')!.split(' ')).toEqual(
      expect.arrayContaining(['offline_access', 'chatgpt.tokens.use.direct']),
    );
  });

  it('reuses the issued client id and drops the name hint after the first sign-in', async () => {
    const t = setup();
    await t.signIn();
    const url = new URL(t.auth.start());
    expect(url.searchParams.get('client_id')).toBe(CLIENT);
    expect(url.searchParams.has('agent_name_hint')).toBe(false);
  });
});

describe('finish', () => {
  it('exchanges the code with the verifier and saves sealed tokens', async () => {
    const t = setup();
    const url = t.auth.start();
    t.answer(() =>
      json(
        tokens(1, {
          id_token: idToken({ nonce: t.nonce(url), email: 'a@example.com' }),
        }),
      ),
    );
    expect(await t.auth.finish(t.callback(url, { client_id: CLIENT }))).toEqual(
      {
        accountLabel: 'a@example.com',
        signedInAt: 1_000_000,
      },
    );
    const body = Object.fromEntries(t.calls[0]!.body);
    expect(t.calls[0]!.url).toBe(TOKEN_URL);
    expect(body).toMatchObject({
      grant_type: 'authorization_code',
      client_id: CLIENT,
      code: 'the-code',
      redirect_uri: REDIRECT_URI,
    });
    expect(
      createHash('sha256').update(body.code_verifier!).digest('base64url'),
    ).toBe(new URL(url).searchParams.get('code_challenge'));
    const row = t.row()!;
    expect(row).toMatchObject({
      client_id: CLIENT,
      account_label: 'a@example.com',
      expires_at: 1_000_000 + 3_600_000,
      rev: 1,
    });
    expect(JSON.stringify(row)).not.toContain('access-1');
    expect(t.secrets.open(row.access_enc as string, ACCESS_PURPOSE)).toBe(
      'access-1',
    );
    expect(t.secrets.open(row.refresh_enc as string, REFRESH_PURPOSE)).toBe(
      'refresh-1',
    );
  });

  it('refuses a wrong, expired or repeated state without asking OpenAI', async () => {
    const t = setup();
    const code = (p: Promise<unknown>) =>
      p.then(
        () => 'ok',
        (e: { code: string }) => e.code,
      );
    const url = t.auth.start();
    const wrong = t
      .callback(url, { client_id: CLIENT })
      .replace(/state=[^&]+/, 'state=forged');
    expect(await code(t.auth.finish(wrong))).toBe('chatgpt_state_invalid');
    expect(await code(t.auth.finish('not an address'))).toBe(
      'chatgpt_state_invalid',
    );

    t.tick(STATE_TTL_MS);
    expect(
      await code(t.auth.finish(t.callback(url, { client_id: CLIENT }))),
    ).toBe('chatgpt_state_invalid');

    const again = t.auth.start();
    t.answer(() => json({ error: 'invalid_grant' }, 400));
    expect(
      await code(t.auth.finish(t.callback(again, { client_id: CLIENT }))),
    ).toBe('chatgpt_sign_in_failed');
    // One attempt: the same address does not work a second time, even after a failure.
    expect(
      await code(t.auth.finish(t.callback(again, { client_id: CLIENT }))),
    ).toBe('chatgpt_state_invalid');
    expect(t.calls).toHaveLength(1);
    expect(t.row()).toBeUndefined();
  });

  it('refuses a first sign-in without an issued client id, a declined consent and a wrong nonce', async () => {
    const t = setup();
    const reason = (p: Promise<unknown>) =>
      p.catch((e: { details: { reason: string } }) => e.details.reason);
    expect(await reason(t.auth.finish(t.callback(t.auth.start())))).toBe(
      'invalid_callback',
    );
    expect(
      await reason(
        t.auth.finish(t.callback(t.auth.start(), { error: 'access_denied' })),
      ),
    ).toBe('access_denied');
    const url = t.auth.start();
    t.answer(() => json(tokens(1, { id_token: idToken({ nonce: 'other' }) })));
    expect(
      await reason(t.auth.finish(t.callback(url, { client_id: CLIENT }))),
    ).toBe('nonce_mismatch');
    expect(t.row()).toBeUndefined();
  });
});

describe('accessToken', () => {
  it('returns the saved token while it has more than 5 minutes left', async () => {
    const t = setup();
    await t.signIn();
    t.tick(50 * 60_000);
    expect(await t.auth.accessToken()).toBe('access-1');
    expect(t.calls).toHaveLength(1);
  });

  it('makes one refresh for 5 parallel calls and saves the new refresh token first', async () => {
    const t = setup();
    await t.signIn();
    t.tick(56 * 60_000);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    t.answer(async () => {
      await gate;
      return json(tokens(2));
    });
    const all = Promise.all(
      Array.from({ length: 5 }, () => t.auth.accessToken()),
    );
    release();
    expect(await all).toEqual(Array(5).fill('access-2'));
    const refreshes = t.calls.slice(1);
    expect(refreshes).toHaveLength(1);
    expect(Object.fromEntries(refreshes[0]!.body)).toMatchObject({
      grant_type: 'refresh_token',
      client_id: CLIENT,
      refresh_token: 'refresh-1',
    });
    const row = t.row()!;
    expect(t.secrets.open(row.refresh_enc as string, REFRESH_PURPOSE)).toBe(
      'refresh-2',
    );
    expect(row).toMatchObject({
      expires_at: 1_000_000 + 56 * 60_000 + 3_600_000,
      rev: 2,
    });
    // The next call uses the saved token, no second refresh.
    expect(await t.auth.accessToken()).toBe('access-2');
    expect(t.calls).toHaveLength(2);
  });

  it('hands out no access token when the new refresh token cannot be saved', async () => {
    const t = setup();
    await t.signIn();
    t.tick(60 * 60_000);
    t.answer(() => {
      // A sign-out in flight: the update finds no row.
      t.db.prepare('DELETE FROM chatgpt_auth').run();
      return json(tokens(2));
    });
    await expect(t.auth.accessToken()).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('turns a refused refresh into auth_error and keeps the row', async () => {
    const t = setup();
    await t.signIn();
    t.tick(60 * 60_000);
    t.answer(() => json({ error: 'refresh_token_reused' }, 400));
    const err = await t.auth.accessToken().catch((e: unknown) => e);
    expect(aiResultOf(err).state).toBe('auth_error');
    expect(t.row()).toBeDefined();
    // Not signed in at all: the same state.
    t.db.prepare('DELETE FROM chatgpt_auth').run();
    expect(
      aiResultOf(await t.auth.accessToken().catch((e: unknown) => e)).state,
    ).toBe('auth_error');
  });

  it('keeps logs free of tokens', async () => {
    const t = setup();
    await t.signIn();
    t.tick(60 * 60_000);
    t.answer(() => json({ error: 'invalid_grant' }, 401));
    await t.auth.accessToken().catch(() => {});
    const logged = JSON.stringify([...log.mock.calls, ...error.mock.calls]);
    for (const token of issued) expect(logged).not.toContain(token);
  });
});

describe('/api/admin/ai/chatgpt', () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(() => cleanup?.());

  it('signs the admin in and out without a token in any response', async () => {
    const calls: { url: string; body: URLSearchParams }[] = [];
    let nonce = '';
    const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body as URLSearchParams });
      return String(url) === REVOKE_URL
        ? new Response(null, { status: 200 })
        : json(
            tokens(9, {
              id_token: idToken({ nonce, email: 'admin@example.com' }),
            }),
          );
    }) as typeof globalThis.fetch;
    const t = await aiSetup(null, {}, fetch);
    cleanup = t.cleanup;
    const req = (
      method: string,
      path: string,
      body?: unknown,
      cookie = t.cookie,
    ) =>
      t.app.request(`/api/admin/ai${path}`, {
        method,
        headers: {
          cookie,
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    expect(
      (
        await req(
          'POST',
          '/chatgpt/start',
          undefined,
          await t.signIn('b@example.com'),
        )
      ).status,
    ).toBe(403);
    const start = await req('POST', '/chatgpt/start');
    const { url } = (await start.json()) as { url: string };
    nonce = new URL(url).searchParams.get('nonce')!;
    const state = new URL(url).searchParams.get('state')!;

    const finish = await req('POST', '/chatgpt/finish', {
      callbackUrl: `${REDIRECT_URI}?code=c&state=${state}&client_id=${CLIENT}`,
    });
    expect(finish.status).toBe(200);
    const finishText = await finish.text();
    expect(JSON.parse(finishText)).toMatchObject({
      accountLabel: 'admin@example.com',
    });
    const status = await (await req('GET', '')).text();
    expect(JSON.parse(status).chatgpt).toEqual({
      accountLabel: 'admin@example.com',
      signedInAt: expect.any(Number),
    });
    for (const text of [url, finishText, status])
      for (const token of issued) expect(text).not.toContain(token);

    expect((await req('DELETE', '/chatgpt')).status).toBe(204);
    expect((await (await req('GET', '')).json()).chatgpt).toBeNull();
    expect(t.db.prepare('SELECT * FROM chatgpt_auth').all()).toEqual([]);
    expect(Object.fromEntries(calls.at(-1)!.body)).toMatchObject({
      token: 'refresh-9',
      token_type_hint: 'refresh_token',
      client_id: CLIENT,
    });
  });
});

describe('GET /api/ai/status with the chatgpt provider', () => {
  it('tells a non-admin the server AI is admin only; the admin sees the usual status', async () => {
    const t = await aiSetup(mockModel('OK'), {
      AI_PROVIDER: 'chatgpt',
      AI_MODEL: 'gpt-5.4',
    });
    const status = async (cookie: string) =>
      (await t.app.request('/api/ai/status', { headers: { cookie } })).json();
    try {
      expect(await status(t.cookie)).toMatchObject({
        recognition: 'ready',
        serverAdminOnly: false,
      });
      expect(await status(await t.signIn('b@example.com'))).toMatchObject({
        recognition: 'not_configured',
        serverAdminOnly: true,
      });
    } finally {
      await t.cleanup();
    }
  });
});
