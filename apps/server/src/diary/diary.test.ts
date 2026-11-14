import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DayResponse, MealInput, SummaryResponse } from '@oct/shared';
import { ensureAdmin } from '../auth/admin.js';
import { hashPassword } from '../auth/password.js';
import { setCookie, testApp } from '../test/app.js';

const PASSWORD = 'Correct-horse-battery-9';

async function setup() {
  const t = testApp();
  await ensureAdmin(t.config, t.db);
  const signIn = async (email: string) => {
    const res = await t.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    return setCookie(res, 'oct_session')!.split(';')[0]!;
  };
  const addUser = async (email: string) => {
    const id = t.db
      .prepare(
        "INSERT INTO users (email, role, webauthn_user_id, created_at) VALUES (?, 'user', randomblob(16), 0) RETURNING id",
      )
      .pluck()
      .get(email) as number;
    t.db
      .prepare(
        'INSERT INTO passwords (user_id, hash, updated_at) VALUES (?, ?, 0)',
      )
      .run(id, await hashPassword(PASSWORD));
    return signIn(email);
  };
  const get = (cookie: string, path: string) =>
    t.app.request(`/api${path}`, { headers: { cookie } });
  /** Logs a 100 kcal meal eaten at `eatenAt` (UTC+3) on `localDate`. */
  const log = async (
    cookie: string,
    eatenAt: string,
    localDate: string,
    kcal = 100.25,
  ) => {
    const body: MealInput = {
      clientId: randomUUID(),
      eatenAt,
      tzOffsetMin: 180,
      localDate,
      mealType: 'snack',
      items: [
        {
          name: 'Apple',
          grams: 150,
          kcal,
          proteinG: 0.5,
          fatG: 0.3,
          carbsG: 21.1,
          source: 'manual',
        },
      ],
    };
    const res = await t.app.request('/api/meals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(201);
  };
  return { ...t, get, log, addUser, cookie: await signIn('admin@example.com') };
}

describe('diary', () => {
  it('puts meals in the day the client chose, late snack last (AC-0.2)', async () => {
    const t = await setup();
    await t.log(t.cookie, '2026-11-12T20:59:00Z', '2026-11-12'); // 23:59
    await t.log(t.cookie, '2026-11-13T01:00:00Z', '2026-11-13'); // 04:00
    await t.log(t.cookie, '2026-11-12T21:30:00Z', '2026-11-12'); // 00:30, "Yesterday"
    await t.log(t.cookie, '2026-11-12T06:00:00Z', '2026-11-12'); // 09:00

    const day = (await (
      await t.get(t.cookie, '/days/2026-11-12')
    ).json()) as DayResponse;
    expect(day.meals.map((m) => m.eatenAt)).toEqual([
      '2026-11-12T06:00:00.000Z',
      '2026-11-12T20:59:00.000Z',
      '2026-11-12T21:30:00.000Z',
    ]);
    expect(day.total.kcal).toBe(300.75);
    expect(day).toMatchObject({ norm: null, remaining: null });
    const next = (await (
      await t.get(t.cookie, '/days/2026-11-13')
    ).json()) as DayResponse;
    expect(next.meals).toHaveLength(1);
  });

  it("matches the day's total in the summary and leaves others' meals out (AC-3.6, AC-0.5)", async () => {
    const t = await setup();
    const other = await t.addUser('other@example.com');
    await t.log(t.cookie, '2026-11-10T06:00:00Z', '2026-11-10', 412.3);
    await t.log(t.cookie, '2026-11-10T12:00:00Z', '2026-11-10', 0.1);
    await t.log(other, '2026-11-10T08:00:00Z', '2026-11-10', 999);
    t.db
      .prepare(
        `INSERT INTO profiles (user_id, kcal_override, protein_pct, fat_pct, carbs_pct, updated_at)
         SELECT id, 2000, 30, 30, 40, 0 FROM users WHERE email = 'admin@example.com'`,
      )
      .run();

    const day = (await (
      await t.get(t.cookie, '/days/2026-11-10')
    ).json()) as DayResponse;
    expect(day.meals).toHaveLength(2);
    expect(day.remaining?.kcal).toBe(2000 - day.total.kcal);

    const res = await t.get(
      t.cookie,
      '/summary?from=2026-11-09&to=2026-11-15&today=2026-11-14',
    );
    expect(res.status).toBe(200);
    const sum = (await res.json()) as SummaryResponse;
    expect(sum.days).toHaveLength(7);
    expect(sum.days[1]).toEqual({ date: '2026-11-10', ...day.total, meals: 2 });
    expect(sum.days[0]).toEqual({
      date: '2026-11-09',
      kcal: 0,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
      meals: 0,
    });
    expect(sum).toMatchObject({ daysWithMeals: 1, budget: { kcal: 14_000 } });
    expect(sum.perRemainingDay).toBe((14_000 - day.total.kcal) / 2);
  });

  it('accepts only a whole week or month with a valid today', async () => {
    const t = await setup();
    const status = async (q: string) =>
      (await t.get(t.cookie, `/summary?${q}`)).status;
    expect(await status('from=2026-11-01&to=2026-11-30&today=2026-11-14')).toBe(
      200,
    );
    expect(await status('from=2026-11-10&to=2026-11-16&today=2026-11-14')).toBe(
      400,
    );
    expect(await status('from=2026-11-01&to=2026-12-31&today=2026-11-14')).toBe(
      400,
    );
    expect(await status('from=2026-11-09&to=2026-11-15')).toBe(400);
    expect(await status('from=2026-11-09&to=2026-11-15&today=2026-02-30')).toBe(
      400,
    );
    expect((await t.get(t.cookie, '/days/2026-13-01')).status).toBe(400);
    expect((await t.app.request('/api/days/2026-11-10')).status).toBe(401);
  });
});
