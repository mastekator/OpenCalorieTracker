import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MealInput } from '@oct/shared';
import { deleteMeals } from '../meals/remove.js';
import type { MealRow } from '../meals/read.js';
import { aiSetup } from '../test/ai.js';
import {
  DELIVERY_INTERVAL_MS,
  deliverDue,
  FAILS_TO_DISABLE,
  RETRY_MS,
  startWebhookDelivery,
} from './outbox.js';
import type { Deliver, DeliveryResult } from './send.js';

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  vi.useRealTimers();
  await cleanup?.();
  cleanup = undefined;
});

const OK: DeliveryResult = { status: 200, error: null, durationMs: 5 };
const FAIL: DeliveryResult = { status: 500, error: null, durationMs: 5 };

const setup = async (env: Record<string, string> = {}) => {
  const t = await aiSetup(null, env);
  cleanup = t.cleanup;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await t.app.request(path, {
      method,
      headers: {
        cookie: t.cookie,
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
  const hook = async (body: object = {}) =>
    (
      await call('POST', '/api/webhooks', {
        name: 'HA',
        url: 'https://example.com/hook',
        events: ['meal.saved'],
        ...body,
      })
    ).body as { id: number; secret: string };
  const meal = async (patch: Partial<MealInput> = {}) =>
    (
      await call('POST', '/api/meals', {
        clientId: randomUUID(),
        eatenAt: '2026-01-10T12:00:00.000Z',
        tzOffsetMin: 180,
        localDate: '2026-01-10',
        mealType: 'lunch',
        items: [
          {
            name: 'Buckwheat',
            grams: 200,
            kcal: 300,
            proteinG: 10,
            fatG: 5,
            carbsG: 50,
            source: 'manual',
          },
        ],
        ...patch,
      })
    ).body as { id: number; clientId: string };
  const outbox = () =>
    t.db.prepare('SELECT * FROM webhook_outbox ORDER BY id').all() as {
      webhook_id: number;
      body: string;
      attempts: number;
      next_at: number;
    }[];
  const webhook = (id: number) =>
    t.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as {
      enabled: number;
      fail_streak: number;
      disabled_reason: string | null;
    };
  const deliverer = (results: DeliveryResult[] = []) => {
    const sent: Parameters<Deliver>[0][] = [];
    const deliver = vi.fn<Deliver>(async (o) => {
      sent.push(o);
      return results.shift() ?? OK;
    });
    return {
      sent,
      deliver,
      run: (now?: number) =>
        deliverDue(
          { db: t.db, config: t.config, secrets: t.secrets, deliver },
          now,
        ),
    };
  };
  return { ...t, call, hook, meal, outbox, webhook, deliverer };
};

describe('webhook outbox (ADR-0027 §3)', () => {
  it('writes nothing without webhooks', async () => {
    const t = await setup();
    await t.meal();
    await t.hook({ enabled: false });
    await t.hook({ events: ['day.closed'] });
    await t.meal();
    expect(t.outbox()).toEqual([]);
  });

  it('queues created, updated and deleted for every enabled webhook', async () => {
    const t = await setup();
    const [a, b] = [await t.hook(), await t.hook({ name: 'B' })];
    const m = await t.meal();
    // A repeat of the clientId saves nothing and tells nobody.
    await t.meal({ clientId: m.clientId });
    await t.call('PATCH', `/api/meals/${m.id}`, { mealType: 'dinner' });
    await t.call('DELETE', `/api/meals/${m.id}`);
    const rows = t.outbox();
    expect(rows.map((r) => r.webhook_id)).toEqual([
      a.id,
      b.id,
      a.id,
      b.id,
      a.id,
      b.id,
    ]);
    const bodies = rows.map((r) => JSON.parse(r.body));
    expect(new Set(bodies.map((x) => x.id)).size).toBe(6);
    expect(bodies[0]).toMatchObject({
      version: 1,
      event: 'meal.saved',
      user: { id: expect.any(Number) },
      data: {
        action: 'created',
        meal: {
          id: m.id,
          date: '2026-01-10',
          mealType: 'lunch',
          items: [
            {
              name: 'Buckwheat',
              grams: 200,
              kcal: 300,
              proteinG: 10,
              fatG: 5,
              carbsG: 50,
            },
          ],
          kcal: 300,
        },
      },
    });
    expect(bodies[0].data.meal).not.toHaveProperty('photo');
    expect(bodies[2].data).toMatchObject({
      action: 'updated',
      meal: { mealType: 'dinner' },
    });
    expect(bodies[4].data).toEqual({
      action: 'deleted',
      meal: {
        id: m.id,
        clientId: m.clientId,
        date: '2026-01-10',
        mealType: 'dinner',
      },
    });
  });

  it('sends nothing for an import undo', async () => {
    const t = await setup();
    await t.hook();
    const m = await t.meal();
    t.db.prepare('DELETE FROM webhook_outbox').run();
    const row = t.db
      .prepare('SELECT * FROM meals WHERE id = ?')
      .get(m.id) as MealRow & { user_id: number };
    await deleteMeals(t.db, t.dataDir, row.user_id, [row]);
    expect(t.outbox()).toEqual([]);
  });

  it('answers the save without waiting for the network', async () => {
    const t = await setup();
    await t.hook();
    const hang = vi.fn<Deliver>(() => new Promise(() => {}));
    const stop = startWebhookDelivery({
      db: t.db,
      config: t.config,
      secrets: t.secrets,
      deliver: hang,
    });
    const m = await t.meal();
    stop();
    expect(m.id).toBeTypeOf('number');
    expect(t.outbox()).toHaveLength(1);
  });

  it('delivers signed events and resets the failure count', async () => {
    const t = await setup();
    const h = await t.hook();
    t.db.prepare('UPDATE webhooks SET fail_streak = 3').run();
    await t.meal();
    const d = t.deliverer();
    await d.run();
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0]).toMatchObject({
      url: 'https://example.com/hook',
      secret: h.secret,
      event: 'meal.saved',
    });
    expect(d.sent[0]!.deliveryId).toBe(JSON.parse(d.sent[0]!.body).id);
    expect(t.outbox()).toEqual([]);
    expect(t.webhook(h.id).fail_streak).toBe(0);
    const log = (await t.call('GET', `/api/webhooks/${h.id}/deliveries`)).body;
    expect(log).toMatchObject([
      { event: 'meal.saved', status: 200, attempts: 1 },
    ]);
  });

  it('retries after 30 s, 2 min and 10 min, then drops the event', async () => {
    const t = await setup();
    const h = await t.hook();
    await t.meal();
    const d = t.deliverer([FAIL, FAIL, FAIL, FAIL]);
    let now = Date.now() + 1000;
    for (const wait of RETRY_MS) {
      await d.run(now);
      expect(t.outbox()[0]!.next_at).toBe(now + wait);
      await d.run(now + wait - 1); // not yet
      now += wait;
    }
    expect(d.sent).toHaveLength(3);
    await d.run(now);
    expect(d.sent).toHaveLength(4);
    expect(new Set(d.sent.map((s) => s.deliveryId)).size).toBe(1);
    expect(t.outbox()).toEqual([]);
    expect(t.webhook(h.id)).toMatchObject({ enabled: 1, fail_streak: 1 });
    const log = (await t.call('GET', `/api/webhooks/${h.id}/deliveries`))
      .body as { attempts: number }[];
    expect(log.map((l) => l.attempts)).toEqual([4, 3, 2, 1]);
  });

  it(`switches the webhook off on the ${FAILS_TO_DISABLE}th failed event`, async () => {
    const t = await setup();
    const h = await t.hook();
    t.db
      .prepare('UPDATE webhooks SET fail_streak = ?')
      .run(FAILS_TO_DISABLE - 2);
    const lastTry = async () => {
      await t.meal();
      t.db
        .prepare('UPDATE webhook_outbox SET attempts = ?')
        .run(RETRY_MS.length);
      await t.deliverer([FAIL]).run();
    };
    await lastTry();
    expect(t.webhook(h.id)).toMatchObject({
      enabled: 1,
      fail_streak: FAILS_TO_DISABLE - 1,
    });
    expect((await t.call('GET', '/api/integrations')).body.webhooks).toEqual({
      count: 1,
      failing: 'HA',
      blocked: false,
    });
    await lastTry();
    expect(t.webhook(h.id)).toMatchObject({
      enabled: 0,
      fail_streak: FAILS_TO_DISABLE,
      disabled_reason: 'failures',
    });
    await t.meal();
    expect(t.outbox()).toEqual([]);
  });

  it('a new deliverer on the same database sends what is left', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const t = await setup();
    await t.hook();
    await t.meal();
    await t.meal();
    const d = t.deliverer();
    const stop = startWebhookDelivery({
      db: t.db,
      config: t.config,
      secrets: t.secrets,
      deliver: d.deliver,
    });
    await vi.advanceTimersByTimeAsync(DELIVERY_INTERVAL_MS);
    expect(d.sent).toHaveLength(2);
    expect(t.outbox()).toEqual([]);
    stop();
  });

  it('under the outbound ban queues nothing, sends nothing and empties the outbox', async () => {
    const t = await setup();
    await t.hook();
    await t.meal();
    expect(t.outbox()).toHaveLength(1);
    await t.signIn('admin@example.com');
    expect(
      (await t.call('PUT', '/api/admin/integrations', { outbound: false }))
        .status,
    ).toBe(200);
    expect(t.outbox()).toEqual([]);
    await t.meal();
    expect(t.outbox()).toEqual([]);
    expect((await t.call('GET', '/api/integrations')).body.webhooks).toEqual({
      count: 1,
      failing: null,
      blocked: true,
    });
  });

  it('empties the outbox when ALLOW_OUTBOUND_REQUESTS=false', async () => {
    const t = await setup();
    await t.hook();
    await t.meal();
    const d = t.deliverer();
    await d.run();
    await t.meal();
    const banned = deliverDue({
      db: t.db,
      config: { ...t.config, outbound: false },
      secrets: t.secrets,
      deliver: d.deliver,
    });
    await banned;
    expect(d.sent).toHaveLength(1);
    expect(t.outbox()).toEqual([]);
  });
});
