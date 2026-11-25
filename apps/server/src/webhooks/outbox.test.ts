import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MealInput } from '@oct/shared';
import { deleteMeals } from '../meals/remove.js';
import type { MealRow } from '../meals/read.js';
import { aiSetup } from '../test/ai.js';
import {
  DELIVERY_INTERVAL_MS,
  deliverDue,
  enqueueTimed,
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

describe('timed webhook events (ADR-0027 §4)', () => {
  // 2026-01-10 20:00 UTC = 23:00 in Moscow (+3), 20:00 in London.
  const at = (iso: string) => Date.parse(iso);
  const timed = async () => {
    const t = await setup();
    const zone = (tz: string | null) =>
      t.db.prepare('UPDATE users SET time_zone = ?').run(tz);
    zone('Europe/Moscow');
    const run = (iso: string) => enqueueTimed(t.db, t.config, at(iso));
    const events = () =>
      t.outbox().map((o) => {
        const b = JSON.parse(o.body) as {
          event: string;
          data: { date: string };
        };
        return [b.event, b.data.date];
      });
    return { ...t, zone, run, events };
  };

  it('day.closed goes once a day at the chosen local time, also after a restart', async () => {
    const t = await timed();
    await t.hook({ events: ['day.closed'], dayClosedAt: '23:00' });
    t.run('2026-01-10T19:59:00Z');
    expect(t.events()).toEqual([]);
    t.run('2026-01-10T20:00:00Z');
    t.run('2026-01-10T20:01:00Z');
    t.run('2026-01-10T20:59:00Z'); // a new process reads last_date from the database
    expect(t.events()).toEqual([['day.closed', '2026-01-10']]);
    t.run('2026-01-11T20:00:00Z');
    expect(t.events()).toEqual([
      ['day.closed', '2026-01-10'],
      ['day.closed', '2026-01-11'],
    ]);
  });

  it('missed days are not caught up', async () => {
    const t = await timed();
    await t.hook({ events: ['day.closed'], dayClosedAt: '23:00' });
    t.run('2026-01-10T20:00:00Z');
    t.run('2026-01-13T20:30:00Z');
    expect(t.events()).toEqual([
      ['day.closed', '2026-01-10'],
      ['day.closed', '2026-01-13'],
    ]);
  });

  it('day.closed carries the totals, the norm and what is left', async () => {
    const t = await timed();
    await t.hook({ events: ['day.closed'], dayClosedAt: '23:00' });
    await t.meal();
    t.run('2026-01-10T20:00:00Z');
    const body = JSON.parse(t.outbox()[0]!.body) as {
      data: { date: string; eaten: { kcal: number } };
    };
    expect(body.data).toMatchObject({
      date: '2026-01-10',
      eaten: { kcal: 300 },
    });
    expect(body.data).toHaveProperty('norm');
    expect(body.data).toHaveProperty('remaining');
  });

  it("the user's time zone moves the event", async () => {
    const t = await timed();
    await t.hook({ events: ['day.closed'], dayClosedAt: '23:00' });
    t.zone('Europe/London');
    t.run('2026-01-10T20:00:00Z');
    expect(t.events()).toEqual([]);
    t.run('2026-01-10T23:00:00Z');
    expect(t.events()).toEqual([['day.closed', '2026-01-10']]);
  });

  it('a midnight time compares as 00:00', async () => {
    const t = await timed();
    await t.hook({ events: ['day.empty'], emptyBy: '00:00' });
    t.run('2026-01-10T21:00:00Z'); // 00:00 on the 11th in Moscow
    expect(t.events()).toEqual([['day.empty', '2026-01-11']]);
  });

  it('day.empty goes only when nothing was logged that day', async () => {
    const t = await timed();
    await t.hook({ events: ['day.empty'], emptyBy: '12:00' });
    await t.meal();
    t.run('2026-01-10T09:00:00Z');
    expect(t.events()).toEqual([]);
    t.db.prepare('DELETE FROM meals').run();
    t.run('2026-01-10T10:00:00Z'); // the day was settled
    t.run('2026-01-11T09:00:00Z');
    expect(t.events()).toEqual([['day.empty', '2026-01-11']]);
  });

  it('a switched-off webhook and the outbound ban send no timed events', async () => {
    const t = await timed();
    const { id } = await t.hook({
      events: ['day.closed'],
      dayClosedAt: '23:00',
    });
    t.db.prepare('UPDATE webhooks SET enabled = 0 WHERE id = ?').run(id);
    t.run('2026-01-10T20:00:00Z');
    t.db.prepare('UPDATE webhooks SET enabled = 1 WHERE id = ?').run(id);
    enqueueTimed(
      t.db,
      { ...t.config, outbound: false },
      at('2026-01-10T20:00:00Z'),
    );
    expect(t.events()).toEqual([]);
  });

  it('the deliverer checks timed events on its own timer', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(at('2026-01-10T20:00:00Z'));
    const t = await timed();
    await t.hook({ events: ['day.closed'], dayClosedAt: '23:00' });
    const d = t.deliverer();
    const stop = startWebhookDelivery({
      db: t.db,
      config: t.config,
      secrets: t.secrets,
      deliver: d.deliver,
    });
    await vi.advanceTimersByTimeAsync(DELIVERY_INTERVAL_MS * 3);
    expect(d.sent.map((s) => s.event)).toEqual(['day.closed']);
    stop();
  });
});
