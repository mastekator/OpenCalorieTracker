import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { session, type AuthEnv } from '../auth/session.js';
import { onError } from '../http/errors.js';
import { aiSetup } from '../test/ai.js';
import { TOKEN_RATE_LIMIT, tokenAuth } from './auth.js';

let cleanup: (() => Promise<void>) | undefined;
const setup = async (env: Record<string, string> = {}) => {
  const t = await aiSetup(null, env);
  cleanup = t.cleanup;
  const call = (
    method: string,
    path: string,
    cookie = t.cookie,
    body?: unknown,
  ) =>
    t.app.request(path, {
      method,
      headers: {
        cookie,
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const user = await t.signIn('b@example.com');
  const create = async (as = user, body: object = {}) => {
    const res = await call('POST', '/api/tokens', as, {
      name: 'Home Assistant',
      scope: 'read',
      ...body,
    });
    return { res, body: await res.json() };
  };
  const bearer = (path: string, token: string, cookie = '') =>
    t.app.request(path, {
      headers: { authorization: `Bearer ${token}`, cookie },
    });
  return { ...t, call, user, create, bearer };
};

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup?.();
  cleanup = undefined;
});

describe('token management (ADR-0027 §1)', () => {
  it('shows the token once and stores only its hash', async () => {
    const t = await setup();
    const before = Date.now();
    const { res, body } = await t.create(t.user, { name: '  HA  ' });
    expect(res.status).toBe(201);
    expect(body.token).toMatch(/^oct_[\w-]{43}$/);
    expect(body).toMatchObject({ name: 'HA', scope: 'read', lastUsedAt: null });
    // 90 days by default.
    const ttl = Date.parse(body.expiresAt) - before;
    expect(Math.round(ttl / 86_400_000)).toBe(90);
    const stored = t.db.prepare('SELECT * FROM api_tokens').get() as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(stored)).not.toContain(body.token.slice(4));
    expect((stored.token_hash as Buffer).length).toBe(32);

    const list = await (await t.call('GET', '/api/tokens', t.user)).json();
    const shown = { ...body, token: undefined };
    expect(list).toEqual([shown]); // toEqual skips undefined keys
  });

  it('creates a token without expiry and rejects a bad body', async () => {
    const t = await setup();
    const { body } = await t.create(t.user, { expiresInDays: null });
    expect(body.expiresAt).toBeNull();
    for (const bad of [
      { name: ' ' },
      { name: 'x'.repeat(61) },
      { scope: 'admin' },
      { expiresInDays: 7 },
    ])
      expect((await t.create(t.user, bad)).res.status).toBe(400);
  });

  it('answers 409 limit_reached on the 21st token (AC-5.5)', async () => {
    const t = await setup();
    for (let i = 0; i < 20; i++)
      expect((await t.create()).res.status).toBe(201);
    const { res, body } = await t.create();
    expect(res.status).toBe(409);
    expect(body).toEqual({ error: { code: 'limit_reached' } });
  });

  it('keeps tokens to their owner: the admin neither sees nor deletes them (AC-0.5)', async () => {
    const t = await setup();
    const { body } = await t.create();
    expect(await (await t.call('GET', '/api/tokens')).json()).toEqual([]);
    expect((await t.call('DELETE', `/api/tokens/${body.id}`)).status).toBe(204);
    expect((await t.call('DELETE', '/api/tokens')).status).toBe(204);
    expect(
      await (await t.call('GET', '/api/tokens', t.user)).json(),
    ).toHaveLength(1);
    expect((await t.call('GET', '/api/tokens', '')).status).toBe(401);
  });

  it('revokes one token or all of them, idempotently', async () => {
    const t = await setup();
    const a = (await t.create()).body;
    await t.create();
    for (let i = 0; i < 2; i++)
      expect(
        (await t.call('DELETE', `/api/tokens/${a.id}`, t.user)).status,
      ).toBe(204);
    expect((await t.bearer('/api/v1/day', a.token)).status).toBe(401);
    expect(
      await (await t.call('GET', '/api/tokens', t.user)).json(),
    ).toHaveLength(1);
    expect((await t.call('DELETE', '/api/tokens', t.user)).status).toBe(204);
    expect(await (await t.call('GET', '/api/tokens', t.user)).json()).toEqual(
      [],
    );
  });

  it('counts the tokens in the integrations summary', async () => {
    const t = await setup();
    await t.create();
    expect(
      (await (await t.call('GET', '/api/integrations', t.user)).json()).tokens,
    ).toEqual({ count: 1, blocked: false });
  });
});

describe('tokenAuth (ADR-0027 §1)', () => {
  it('lets a token through /api/v1 only, never the internal API', async () => {
    const t = await setup();
    const { token } = (await t.create()).body;
    // Past tokenAuth: no /api/v1 routes yet, so the catch-all answers.
    const v1 = await t.bearer('/api/v1/day', token);
    expect(v1.status).toBe(404);
    for (const path of ['/api/profile', '/api/tokens', '/api/admin/users']) {
      const res = await t.bearer(path, token);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: { code: 'unauthenticated' } });
    }
  });

  it('answers 401 invalid_token for missing, unknown, expired and revoked tokens', async () => {
    const t = await setup();
    const { id, token } = (await t.create()).body;
    const no = await t.app.request('/api/v1/day', {
      headers: { cookie: t.user },
    });
    expect(no.status).toBe(401);
    expect(await no.json()).toEqual({ error: { code: 'invalid_token' } });
    expect((await t.bearer('/api/v1/day', 'oct_nope')).status).toBe(401);
    expect((await t.bearer('/api/v1/day', token.slice(4))).status).toBe(401);
    t.db
      .prepare('UPDATE api_tokens SET expires_at = ? WHERE id = ?')
      .run(Date.now() - 1, id);
    expect((await t.bearer('/api/v1/day', token)).status).toBe(401);
    t.db.prepare('UPDATE api_tokens SET expires_at = NULL').run();
    expect((await t.bearer('/api/v1/day', token)).status).toBe(404);
    // Deleting the user cascades to the token.
    t.db.prepare("DELETE FROM users WHERE email = 'b@example.com'").run();
    expect((await t.bearer('/api/v1/day', token)).status).toBe(401);
  });

  it('takes the user and scope from the token, never from the cookie', async () => {
    const t = await setup();
    const { token } = (await t.create(t.user, { scope: 'write' })).body;
    const echo = new Hono<AuthEnv>()
      .use('/api/*', session(t))
      .use('/api/v1/*', tokenAuth(t))
      .get('/api/v1/me', (c) =>
        c.json({ email: c.var.user?.email, scope: c.var.tokenScope }),
      );
    echo.onError(onError);
    const me = (bearerToken: string) =>
      echo.request('/api/v1/me', {
        headers: { authorization: `Bearer ${bearerToken}`, cookie: t.cookie },
      });
    expect(await (await me(token)).json()).toEqual({
      email: 'b@example.com',
      scope: 'write',
    });
    // The admin's cookie with a bad token: 401, not the admin.
    expect((await me('oct_bad')).status).toBe(401);
  });

  it('writes last_used_at at most once a minute', async () => {
    const t = await setup();
    const { id, token } = (await t.create()).body;
    const used = () =>
      t.db
        .prepare('SELECT last_used_at FROM api_tokens WHERE id = ?')
        .pluck()
        .get(id) as number | null;
    await t.bearer('/api/v1/day', token);
    expect(used()).not.toBeNull();
    const recent = Date.now() - 30_000;
    t.db.prepare('UPDATE api_tokens SET last_used_at = ?').run(recent);
    await t.bearer('/api/v1/day', token);
    expect(used()).toBe(recent);
    t.db.prepare('UPDATE api_tokens SET last_used_at = ?').run(recent - 31_000);
    await t.bearer('/api/v1/day', token);
    expect(used()).toBeGreaterThan(recent);
    const { lastUsedAt } = (
      await (await t.call('GET', '/api/tokens', t.user)).json()
    )[0];
    expect(lastUsedAt).not.toBeNull();
  });

  it('answers 429 rate_limited with Retry-After past 60 requests a minute', async () => {
    const t = await setup();
    const { token } = (await t.create()).body;
    const other = (await t.create()).body.token;
    let now = 1_000_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    for (let i = 0; i < TOKEN_RATE_LIMIT; i++)
      expect((await t.bearer('/api/v1/day', token)).status).toBe(404);
    now += 20_500;
    const res = await t.bearer('/api/v1/day', token);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('40');
    expect(await res.json()).toEqual({ error: { code: 'rate_limited' } });
    // Per token.
    expect((await t.bearer('/api/v1/day', other)).status).toBe(404);
    // The next window starts afresh.
    now += 40_000;
    expect((await t.bearer('/api/v1/day', token)).status).toBe(404);
  });

  it('never logs the token or the Authorization header', async () => {
    const t = await setup();
    const { token } = (await t.create()).body;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = new Hono<AuthEnv>()
      .use('/api/v1/*', tokenAuth(t))
      .get('/api/v1/boom', () => {
        throw new Error('boom');
      });
    app.onError(onError);
    const res = await app.request('/api/v1/boom', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(500);
    expect(log).toHaveBeenCalled();
    const logged = log.mock.calls
      .flat()
      .map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a)))
      .join(' ');
    expect(logged).not.toContain(token);
    expect(logged.toLowerCase()).not.toContain('authorization');
  });
});

describe('the admin switch for tokens (ADR-0027 §6)', () => {
  it('turns tokens off without deleting them', async () => {
    const t = await setup();
    const { token } = (await t.create()).body;
    const put = await t.call('PUT', '/api/admin/integrations', t.cookie, {
      tokens: false,
    });
    expect(await put.json()).toEqual({
      outbound: true,
      outboundFromEnv: false,
      tokens: false,
      tokensFromEnv: false,
    });
    const res = await t.bearer('/api/v1/day', token);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: 'integrations_disabled' },
    });
    expect((await t.create()).res.status).toBe(403);
    expect(
      await (await t.call('GET', '/api/tokens', t.user)).json(),
    ).toHaveLength(1);
    expect(
      (await (await t.call('GET', '/api/integrations', t.user)).json()).tokens,
    ).toEqual({ count: 1, blocked: true });

    await t.call('PUT', '/api/admin/integrations', t.cookie, { tokens: true });
    expect((await t.bearer('/api/v1/day', token)).status).toBe(404);
  });

  it('lets ALLOW_API_TOKENS win over the table and refuses PUT of that switch only', async () => {
    const t = await setup({ ALLOW_API_TOKENS: 'false' });
    const get = async () =>
      (await t.call('GET', '/api/admin/integrations')).json();
    expect(await get()).toMatchObject({ tokens: false, tokensFromEnv: true });
    const res = await t.call('PUT', '/api/admin/integrations', t.cookie, {
      tokens: true,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'tokens_env_managed' } });
    // The other switch still saves, and the table keeps tokens allowed underneath.
    expect(
      (
        await t.call('PUT', '/api/admin/integrations', t.cookie, {
          outbound: false,
        })
      ).status,
    ).toBe(200);
    expect(await get()).toMatchObject({ outbound: false, tokens: false });
    expect(
      t.db
        .prepare('SELECT tokens_allowed FROM integration_settings')
        .pluck()
        .get(),
    ).toBe(1);
  });

  it('rejects an empty PUT', async () => {
    const t = await setup();
    expect(
      (await t.call('PUT', '/api/admin/integrations', t.cookie, {})).status,
    ).toBe(400);
  });
});
