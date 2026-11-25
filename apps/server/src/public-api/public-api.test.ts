import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MealInput } from '@oct/shared';
import { aiSetup } from '../test/ai.js';

let cleanup: (() => Promise<void>) | undefined;
const setup = async () => {
  const t = await aiSetup(null);
  cleanup = t.cleanup;
  const user = await t.signIn('b@example.com');
  const userId = t.db
    .prepare("SELECT id FROM users WHERE email = 'b@example.com'")
    .pluck()
    .get() as number;
  const call = (method: string, path: string, body?: unknown) =>
    t.app.request(path, {
      method,
      headers: {
        cookie: user,
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const token = async (scope: 'read' | 'write') =>
    (
      (await (
        await call('POST', '/api/tokens', { name: 'HA', scope })
      ).json()) as { token: string }
    ).token;
  const v1 = (token: string, path: string, body?: unknown) =>
    t.app.request(`/api/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  /** A meal through the app's own API, eaten at `eatenAt` (UTC+3) on `localDate`. */
  const log = async (eatenAt: string, localDate: string, kcal: number) => {
    const body: MealInput = {
      clientId: randomUUID(),
      eatenAt,
      tzOffsetMin: 180,
      localDate,
      mealType: 'lunch',
      items: [
        {
          name: 'Soup',
          grams: 300,
          kcal,
          proteinG: 10.5,
          fatG: 4.25,
          carbsG: 20,
          source: 'manual',
        },
      ],
    };
    expect((await call('POST', '/api/meals', body)).status).toBe(201);
  };
  const setZone = (zone: string | null) =>
    t.db
      .prepare('UPDATE users SET time_zone = ? WHERE id = ?')
      .run(zone, userId);
  return { ...t, user, userId, call, token, v1, log, setZone };
};

afterEach(async () => {
  vi.useRealTimers();
  await cleanup?.();
  cleanup = undefined;
});

describe('the user time zone (ADR-0027 §4)', () => {
  it('saves a valid zone without moving settingsRev and rejects a bad one', async () => {
    const t = await setup();
    const before = await (await t.call('GET', '/api/account/settings')).json();
    expect(before.timeZone).toBeNull();
    const bad = await t.call('PATCH', '/api/account/settings', {
      timeZone: 'Mars/Olympus',
    });
    expect(bad.status).toBe(400);
    for (const zone of ['Europe/Moscow', 'UTC']) {
      const res = await t.call('PATCH', '/api/account/settings', {
        timeZone: zone,
      });
      expect(res.status).toBe(200);
      const after = await res.json();
      expect(after.timeZone).toBe(zone);
      expect(after.settingsRev).toBe(before.settingsRev);
    }
  });
});

describe('/api/v1 reading (ADR-0027 §2)', () => {
  it('gives the same day as the Today screen', async () => {
    const t = await setup();
    t.db
      .prepare(
        `INSERT INTO profiles (user_id, kcal_override, protein_pct, fat_pct, carbs_pct, rev, updated_at)
         VALUES (?, 2000, 30, 30, 40, 1, 0)`,
      )
      .run(t.userId);
    await t.log('2026-11-12T09:00:00Z', '2026-11-12', 410.5);
    await t.log('2026-11-12T15:00:00Z', '2026-11-12', 250);
    const read = await t.token('read');
    const internal = await (await t.call('GET', '/api/days/2026-11-12')).json();
    const res = await t.v1(read, '/day?date=2026-11-12');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      date: '2026-11-12',
      eaten: internal.total,
      norm: internal.norm,
      remaining: internal.remaining,
    });
    expect(internal.norm).not.toBeNull();
  });

  it('counts today in the user zone, not the server one', async () => {
    const t = await setup();
    const read = await t.token('read');
    vi.useFakeTimers({
      toFake: ['Date'],
      now: Date.parse('2027-01-01T23:30:00Z'),
    });
    t.setZone('Pacific/Kiritimati'); // UTC+14
    expect((await (await t.v1(read, '/day')).json()).date).toBe('2027-01-02');
    t.setZone('America/Los_Angeles');
    expect((await (await t.v1(read, '/day')).json()).date).toBe('2027-01-01');
  });

  it('lists days and meals without photos, internal fields or the email', async () => {
    const t = await setup();
    await t.log('2026-11-12T09:00:00Z', '2026-11-12', 300);
    const read = await t.token('read');
    const days = await (
      await t.v1(read, '/days?from=2026-11-11&to=2026-11-12')
    ).json();
    expect(days.days).toEqual([
      {
        date: '2026-11-11',
        eaten: { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
        meals: 0,
      },
      {
        date: '2026-11-12',
        eaten: { kcal: 300, proteinG: 10.5, fatG: 4.25, carbsG: 20 },
        meals: 1,
      },
    ]);
    const { meals } = await (
      await t.v1(read, '/meals?from=2026-11-12&to=2026-11-12')
    ).json();
    expect(meals).toHaveLength(1);
    expect(Object.keys(meals[0]).sort()).toEqual([
      'carbsG',
      'clientId',
      'dishes',
      'eatenAt',
      'fatG',
      'kcal',
      'localDate',
      'mealType',
      'proteinG',
    ]);
    const profile = await (await t.v1(read, '/profile')).json();
    expect(profile).toMatchObject({
      units: 'metric',
      locale: expect.any(String),
    });
    expect(JSON.stringify(profile)).not.toContain('@');
  });

  it('answers 400 period_too_long past 366 days or 31 days of meals', async () => {
    const t = await setup();
    const read = await t.token('read');
    const status = async (path: string) => {
      const res = await t.v1(read, path);
      return [res.status, (await res.json()).error?.code];
    };
    expect(await status('/days?from=2026-01-01&to=2027-01-01')).toEqual([
      200,
      undefined,
    ]);
    expect(await status('/days?from=2026-01-01&to=2027-01-02')).toEqual([
      400,
      'period_too_long',
    ]);
    expect(await status('/meals?from=2026-01-01&to=2026-01-31')).toEqual([
      200,
      undefined,
    ]);
    expect(await status('/meals?from=2026-01-01&to=2026-02-01')).toEqual([
      400,
      'period_too_long',
    ]);
    expect(await status('/meals?from=2026-02-01&to=2026-01-01')).toEqual([
      400,
      'validation_failed',
    ]);
  });
});

describe('POST /api/v1/meals (ADR-0027 §2)', () => {
  const body = {
    dishes: [{ name: 'Protein bar', grams: 60, kcal: 220, proteinG: 20 }],
  };

  it('refuses a read token with 403 insufficient_scope', async () => {
    const t = await setup();
    const res = await t.v1(await t.token('read'), '/meals', body);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: 'insufficient_scope' } });
    expect(t.db.prepare('SELECT COUNT(*) FROM meals').pluck().get()).toBe(0);
  });

  it('saves one meal per clientId, with source api and the day in the user zone', async () => {
    const t = await setup();
    t.setZone('Asia/Tokyo'); // UTC+9: 23:30Z is 08:30 the next day
    const write = await t.token('write');
    const clientId = randomUUID();
    const once = { ...body, clientId, eatenAt: '2026-11-11T23:30:00Z' };
    const first = await t.v1(write, '/meals', once);
    expect(first.status).toBe(201);
    const meal = await first.json();
    expect(meal).toMatchObject({
      clientId,
      localDate: '2026-11-12',
      mealType: 'breakfast',
      kcal: 220,
      dishes: [{ name: 'Protein bar', source: 'api', fatG: 0, carbsG: 0 }],
    });
    const again = await t.v1(write, '/meals', once);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(meal);
    expect(t.db.prepare('SELECT COUNT(*) FROM meals').pluck().get()).toBe(1);
    expect(t.db.prepare('SELECT tz_offset_min FROM meals').pluck().get()).toBe(
      540,
    );
  });

  it('applies the internal rules to dishes', async () => {
    const t = await setup();
    const write = await t.token('write');
    for (const dishes of [
      [],
      [{ name: ' ', grams: 60, kcal: 1 }],
      [{ name: 'X', grams: 0, kcal: 1 }],
    ]) {
      expect((await t.v1(write, '/meals', { dishes })).status).toBe(400);
    }
    const future = {
      ...body,
      eatenAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
    expect((await t.v1(write, '/meals', future)).status).toBe(400);
  });
});
