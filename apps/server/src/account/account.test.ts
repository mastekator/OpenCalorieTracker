import { describe, expect, it } from 'vitest';
import { ensureAdmin } from '../auth/admin.js';
import { setCookie, testApp } from '../test/app.js';

async function setup() {
  const t = testApp();
  await ensureAdmin(t.config, t.db);
  const res = await t.app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'Correct-horse-battery-9',
    }),
  });
  const cookie = setCookie(res, 'oct_session')!.split(';')[0]!;
  const patch = (body: unknown, c = cookie) =>
    t.app.request('/api/account/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: c },
      body: JSON.stringify(body),
    });
  const syncRev = () =>
    (t.db.prepare('SELECT sync_rev FROM users').get() as { sync_rev: number })
      .sync_rev;
  return { ...t, cookie, patch, syncRev };
}

describe('PATCH /api/account/settings', () => {
  it('changes each field, bumping the revision every time', async () => {
    const { patch, syncRev } = await setup();
    expect(await (await patch({ locale: 'ru' })).json()).toEqual({
      locale: 'ru',
      theme: 'system',
      units: 'metric',
      settingsRev: 1,
      photoRetentionDays: 30,
    });
    expect(await (await patch({ theme: 'dark' })).json()).toMatchObject({
      theme: 'dark',
      settingsRev: 2,
    });
    expect(await (await patch({ units: 'us' })).json()).toEqual({
      locale: 'ru',
      theme: 'dark',
      units: 'us',
      settingsRev: 3,
      photoRetentionDays: 30,
    });
    expect(syncRev()).toBe(3);
  });

  it('ignores an edit older than the stored one and answers with current values', async () => {
    const { patch, syncRev } = await setup();
    await patch({ theme: 'dark', editedAt: 2000 });
    const res = await patch({ theme: 'light', editedAt: 1000 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ theme: 'dark', settingsRev: 1 });
    expect(syncRev()).toBe(1);
    // An equal editedAt still applies.
    expect(
      await (await patch({ theme: 'light', editedAt: 2000 })).json(),
    ).toMatchObject({ theme: 'light', settingsRev: 2 });
  });

  it('clamps a future editedAt to server time so later edits still apply', async () => {
    const { patch, db } = await setup();
    const year = 365 * 24 * 3600 * 1000;
    const before = Date.now();
    await patch({ theme: 'dark', editedAt: before + year });
    const { settings_edited_at: stored } = db
      .prepare('SELECT settings_edited_at FROM users')
      .get() as { settings_edited_at: number };
    expect(stored).toBeLessThanOrEqual(Date.now());
    expect(
      await (await patch({ theme: 'light', editedAt: Date.now() })).json(),
    ).toMatchObject({ theme: 'light' });
    // A future date already stored before the fix does not block edits either.
    db.prepare('UPDATE users SET settings_edited_at = ?').run(before + year);
    expect(
      await (await patch({ theme: 'dark', editedAt: Date.now() })).json(),
    ).toMatchObject({ theme: 'dark' });
  });

  it('writes nothing for an empty change', async () => {
    const { patch, syncRev } = await setup();
    expect(await (await patch({ editedAt: 5 })).json()).toMatchObject({
      settingsRev: 0,
    });
    await patch({});
    expect(syncRev()).toBe(0);
  });

  it('rejects values outside the lists with 400', async () => {
    const { patch } = await setup();
    for (const body of [
      { locale: 'de' },
      { theme: 'blue' },
      { units: 'imperial' },
      { editedAt: -1 },
    ]) {
      expect((await patch(body)).status).toBe(400);
    }
  });

  it('is 401 without a session', async () => {
    const { patch } = await setup();
    expect((await patch({ theme: 'dark' }, '')).status).toBe(401);
  });

  it('shows units in /auth/me', async () => {
    const { app, cookie, patch } = await setup();
    await patch({ units: 'us' });
    const me = await app.request('/api/auth/me', { headers: { cookie } });
    expect(await me.json()).toMatchObject({ units: 'us' });
  });
});
