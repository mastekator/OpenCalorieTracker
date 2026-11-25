import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiSetup } from '../test/ai.js';
import type { Deliver } from './send.js';
import { sign } from './send.js';
import {
  logDelivery,
  WEBHOOK_SECRET_PURPOSE,
  WEBHOOK_TEST_RATE_LIMIT,
} from './routes.js';

let cleanup: (() => Promise<void>) | undefined;
const setup = async (env: Record<string, string> = {}) => {
  const sent: Parameters<Deliver>[0][] = [];
  const deliverWebhook = vi.fn<Deliver>(async (o) => {
    sent.push(o);
    return { status: 200, error: null, durationMs: 12 };
  });
  const t = await aiSetup(null, env, undefined, deliverWebhook);
  cleanup = t.cleanup;
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    cookie = t.cookie,
  ) => {
    const res = await t.app.request(path, {
      method,
      headers: {
        cookie,
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: res.status,
      body: res.status === 204 ? null : await res.json(),
    };
  };
  const create = (body: object = {}, cookie = t.cookie) =>
    call(
      'POST',
      '/api/webhooks',
      {
        name: 'HA',
        url: 'https://example.com/hook',
        events: ['meal.saved'],
        ...body,
      },
      cookie,
    );
  return { ...t, call, create, sent, deliverWebhook };
};

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe('webhooks CRUD (ADR-0027 §3)', () => {
  it('shows the secret once and stores it sealed', async () => {
    const t = await setup();
    const { status, body } = await t.create({ name: '  HA  ' });
    expect(status).toBe(201);
    expect(body).toMatchObject({
      name: 'HA',
      events: ['meal.saved'],
      dayClosedAt: '23:59',
      emptyBy: null,
      enabled: true,
      failStreak: 0,
      disabledReason: null,
    });
    expect(body.secret).toMatch(/^[\w-]{43}$/);
    const stored = t.db
      .prepare('SELECT secret_enc FROM webhooks')
      .pluck()
      .get() as string;
    expect(stored).not.toContain(body.secret);
    expect(t.secrets.open(stored, WEBHOOK_SECRET_PURPOSE)).toBe(body.secret);

    const list = await t.call('GET', '/api/webhooks');
    expect(list.body).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(body.secret);

    const renewed = await t.call('POST', `/api/webhooks/${body.id}/secret`);
    expect(renewed.body.secret).not.toBe(body.secret);
    const now = t.db
      .prepare('SELECT secret_enc FROM webhooks')
      .pluck()
      .get() as string;
    expect(t.secrets.open(now, WEBHOOK_SECRET_PURPOSE)).toBe(
      renewed.body.secret,
    );
  });

  it('allows plain http only to the home network', async () => {
    const t = await setup();
    expect((await t.create({ url: 'http://example.com/hook' })).body).toEqual({
      error: { code: 'http_not_private' },
    });
    expect((await t.create({ url: 'http://192.168.1.10:8123/x' })).status).toBe(
      201,
    );
    expect((await t.create({ url: 'http://ha.local:8123/x' })).status).toBe(
      201,
    );
    expect((await t.create({ url: 'ftp://example.com/x' })).status).toBe(400);
    const { body } = await t.create();
    // A new url is checked again.
    const res = await t.call('PATCH', `/api/webhooks/${body.id}`, {
      url: 'http://example.com/x',
    });
    expect(res.status).toBe(400);
  });

  it('validates events and emptyBy', async () => {
    const t = await setup();
    expect((await t.create({ events: [] })).status).toBe(400);
    expect(
      (await t.create({ events: ['meal.saved', 'meal.saved'] })).status,
    ).toBe(400);
    expect((await t.create({ events: ['day.empty'] })).status).toBe(400);
    expect(
      (await t.create({ events: ['day.empty'], emptyBy: '25:00' })).status,
    ).toBe(400);
    const { body } = await t.create({
      events: ['day.empty'],
      emptyBy: '14:00',
    });
    expect(body.emptyBy).toBe('14:00');
    // The merged webhook is checked: dropping emptyBy while day.empty stays is refused.
    const res = await t.call('PATCH', `/api/webhooks/${body.id}`, {
      emptyBy: null,
    });
    expect(res.status).toBe(400);
  });

  it('switching on resets the failure streak', async () => {
    const t = await setup();
    const { body } = await t.create();
    t.db
      .prepare(
        "UPDATE webhooks SET enabled = 0, fail_streak = 20, disabled_reason = 'failures'",
      )
      .run();
    const renamed = await t.call('PATCH', `/api/webhooks/${body.id}`, {
      name: 'X',
    });
    expect(renamed.body).toMatchObject({
      name: 'X',
      enabled: false,
      failStreak: 20,
    });
    const on = await t.call('PATCH', `/api/webhooks/${body.id}`, {
      enabled: true,
    });
    expect(on.body).toMatchObject({
      enabled: true,
      failStreak: 0,
      disabledReason: null,
    });
  });

  it('limits webhooks per user', async () => {
    const t = await setup();
    for (let i = 0; i < 10; i++) expect((await t.create()).status).toBe(201);
    expect((await t.create()).body).toEqual({
      error: { code: 'limit_reached' },
    });
  });

  it("answers 404 for someone else's webhook", async () => {
    const t = await setup();
    const { body } = await t.create();
    const other = await t.signIn('b@example.com');
    for (const [method, path, payload] of [
      ['PATCH', '', { name: 'Mine' }],
      ['POST', '/secret'],
      ['POST', '/test'],
      ['GET', '/deliveries'],
      ['DELETE', ''],
    ] as const) {
      const res = await t.call(
        method,
        `/api/webhooks/${body.id}${path}`,
        payload,
        other,
      );
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    expect(
      (await t.call('GET', '/api/webhooks', undefined, other)).body,
    ).toEqual([]);
    expect(t.deliverWebhook).not.toHaveBeenCalled();
    expect((await t.call('DELETE', `/api/webhooks/${body.id}`)).status).toBe(
      204,
    );
    expect((await t.call('GET', '/api/webhooks')).body).toEqual([]);
  });

  it('needs a session', async () => {
    const t = await setup();
    expect((await t.call('GET', '/api/webhooks', undefined, '')).status).toBe(
      401,
    );
  });
});

describe('send test', () => {
  it('signs a test event and logs it, keeping the last 20', async () => {
    const t = await setup();
    const { body: hook } = await t.create({ enabled: false });
    const res = await t.call('POST', `/api/webhooks/${hook.id}/test`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      event: 'test',
      status: 200,
      error: null,
      attempts: 1,
      durationMs: 12,
    });
    const o = t.sent[0]!;
    expect(o).toMatchObject({
      url: 'https://example.com/hook',
      secret: hook.secret,
      event: 'test',
    });
    const body = JSON.parse(o.body);
    expect(body).toMatchObject({
      version: 1,
      id: o.deliveryId,
      event: 'test',
      data: {},
    });
    expect(sign(hook.secret, 1, o.body)).toMatch(/^[0-9a-f]{64}$/);

    for (let i = 0; i < 21; i++)
      logDelivery(t.db, hook.id, 'test', 1, {
        status: 200,
        error: null,
        durationMs: 1,
      });
    const log = await t.call('GET', `/api/webhooks/${hook.id}/deliveries`);
    expect(log.body).toHaveLength(20);
    expect(log.body[0].id).toBeGreaterThan(log.body[19].id);
  });

  it('answers 429 past 10 test sends a minute per user', async () => {
    const t = await setup();
    const { body: hook } = await t.create();
    const send = (cookie = t.cookie) =>
      t.call('POST', `/api/webhooks/${hook.id}/test`, undefined, cookie);
    const start = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    for (let i = 0; i < WEBHOOK_TEST_RATE_LIMIT; i++)
      expect((await send()).status).toBe(200);
    const res = await t.app.request(`/api/webhooks/${hook.id}/test`, {
      method: 'POST',
      headers: { cookie: t.cookie, origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(await res.json()).toEqual({
      error: { code: 'too_many_attempts', details: { retryAfterSec: 60 } },
    });
    expect(t.deliverWebhook).toHaveBeenCalledTimes(WEBHOOK_TEST_RATE_LIMIT);

    // Another user's budget is separate; their webhook id is not ours.
    const other = await t.signIn('b@example.com');
    const { body: theirs } = await t.create({}, other);
    expect(
      (
        await t.call(
          'POST',
          `/api/webhooks/${theirs.id}/test`,
          undefined,
          other,
        )
      ).status,
    ).toBe(200);

    now.mockReturnValue(start + 60_000);
    expect((await send()).status).toBe(200);
    now.mockRestore();
  });

  it('logs a failure', async () => {
    const t = await setup();
    t.deliverWebhook.mockResolvedValueOnce({
      status: null,
      error: 'blocked_address',
      durationMs: 1,
    });
    const { body: hook } = await t.create();
    const res = await t.call('POST', `/api/webhooks/${hook.id}/test`);
    expect(res.body).toMatchObject({ status: null, error: 'blocked_address' });
  });
});

describe("the admin's ban on outbound requests", () => {
  it('refuses a test and saving an enabled webhook, not a disabled one', async () => {
    const t = await setup();
    const { body: hook } = await t.create();
    t.db
      .prepare(
        'INSERT INTO integration_settings (id, outbound_allowed, updated_at) VALUES (1, 0, 0) ON CONFLICT (id) DO UPDATE SET outbound_allowed = 0',
      )
      .run();
    const banned = { error: { code: 'outbound_disabled' } };
    expect(
      (await t.call('POST', `/api/webhooks/${hook.id}/test`)).body,
    ).toEqual(banned);
    expect((await t.create()).body).toEqual(banned);
    expect(
      (await t.call('PATCH', `/api/webhooks/${hook.id}`, { name: 'X' })).body,
    ).toEqual(banned);
    expect((await t.create({ enabled: false })).status).toBe(201);
    const off = await t.call('PATCH', `/api/webhooks/${hook.id}`, {
      enabled: false,
    });
    expect(off.body.enabled).toBe(false);
    expect(t.deliverWebhook).not.toHaveBeenCalled();
  });

  it('follows ALLOW_OUTBOUND_REQUESTS', async () => {
    const t = await setup({ ALLOW_OUTBOUND_REQUESTS: 'false' });
    expect((await t.create()).status).toBe(403);
  });
});

it('deleting the user deletes the webhooks and their log', async () => {
  const t = await setup();
  const other = await t.signIn('b@example.com');
  const { body: hook } = await t.create({}, other);
  await t.call('POST', `/api/webhooks/${hook.id}/test`, undefined, other);
  t.db.prepare("DELETE FROM users WHERE email = 'b@example.com'").run();
  expect(t.db.prepare('SELECT count(*) FROM webhooks').pluck().get()).toBe(0);
  expect(
    t.db.prepare('SELECT count(*) FROM webhook_deliveries').pluck().get(),
  ).toBe(0);
});
