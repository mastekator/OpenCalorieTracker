import { afterEach, describe, expect, it } from 'vitest';
import { aiSetup } from '../test/ai.js';

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
  const summary = async () =>
    (await call('GET', '/api/integrations', user)).json();
  const setOff = (offEnabled: boolean) =>
    call('PATCH', '/api/account/settings', user, { offEnabled });
  return { ...t, call, user, summary, setOff };
};

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe('outbound switches (ADR-0034 §5)', () => {
  it('is allowed by the admin and off for the user by default (AC-0.1, AC-0.6)', async () => {
    const t = await setup();
    expect(
      await (await t.call('GET', '/api/admin/integrations')).json(),
    ).toEqual({
      outbound: true,
      outboundFromEnv: false,
      tokens: true,
      tokensFromEnv: false,
    });
    expect(await t.summary()).toEqual({
      barcode: { enabled: false, blocked: false },
      export: { lastAt: null, lastFormat: null },
      tokens: { count: 0, blocked: false },
      webhooks: { count: 0, failing: null, blocked: false },
      mcp: { enabled: false, blocked: false },
    });
  });

  it('saves the admin switch and keeps the user one (E-6)', async () => {
    const t = await setup();
    expect((await t.setOff(true)).status).toBe(200);
    const res = await t.call('PUT', '/api/admin/integrations', t.cookie, {
      outbound: false,
    });
    expect(await res.json()).toEqual({
      outbound: false,
      outboundFromEnv: false,
      tokens: true,
      tokensFromEnv: false,
    });
    expect(await t.summary()).toEqual({
      barcode: { enabled: true, blocked: true },
      export: { lastAt: null, lastFormat: null },
      tokens: { count: 0, blocked: false },
      webhooks: { count: 0, failing: null, blocked: true },
      mcp: { enabled: false, blocked: false },
    });
    await t.call('PUT', '/api/admin/integrations', t.cookie, {
      outbound: true,
    });
    expect(await t.summary()).toEqual({
      barcode: { enabled: true, blocked: false },
      export: { lastAt: null, lastFormat: null },
      tokens: { count: 0, blocked: false },
      webhooks: { count: 0, failing: null, blocked: false },
      mcp: { enabled: false, blocked: false },
    });
  });

  it('lets ALLOW_OUTBOUND_REQUESTS win over the table and refuses PUT', async () => {
    const t = await setup({ ALLOW_OUTBOUND_REQUESTS: 'false' });
    t.db
      .prepare(
        'INSERT INTO integration_settings (id, outbound_allowed, updated_at) VALUES (1, 1, 0)',
      )
      .run();
    expect(
      await (await t.call('GET', '/api/admin/integrations')).json(),
    ).toEqual({
      outbound: false,
      outboundFromEnv: true,
      tokens: true,
      tokensFromEnv: false,
    });
    const res = await t.call('PUT', '/api/admin/integrations', t.cookie, {
      outbound: true,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: 'outbound_env_managed' },
    });
    expect((await t.summary()).barcode.blocked).toBe(true);
  });

  it('keeps the admin routes to admins and the summary to signed-in users', async () => {
    const t = await setup();
    expect(
      (await t.call('GET', '/api/admin/integrations', t.user)).status,
    ).toBe(403);
    expect(
      (
        await t.call('PUT', '/api/admin/integrations', t.user, {
          outbound: false,
        })
      ).status,
    ).toBe(403);
    expect((await t.call('GET', '/api/admin/integrations', '')).status).toBe(
      401,
    );
    expect((await t.call('GET', '/api/integrations', '')).status).toBe(401);
  });

  it('rejects a body that is not a boolean', async () => {
    const t = await setup();
    const res = await t.call('PUT', '/api/admin/integrations', t.cookie, {
      outbound: 'no',
    });
    expect(res.status).toBe(400);
  });
});
