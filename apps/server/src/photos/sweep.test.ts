import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureAdmin } from '../auth/admin.js';
import { setCookie, testApp } from '../test/app.js';
import { photoPath } from './store.js';
import { ORPHAN_AGE_MS, sweepPhotos } from './sweep.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-06-01T12:00:00Z');
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true })));
});

async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), 'oct-sweep-'));
  dirs.push(dataDir);
  const t = testApp({ DATA_DIR: dataDir });
  await ensureAdmin(t.config, t.db);
  const userId = t.db.prepare('SELECT id FROM users').pluck().get() as number;
  let n = 0;
  /** A photo's files, aged `ageMs` by mtime. */
  const files = async (photoId: string, ageMs = 0, uid = userId) => {
    await mkdir(join(dataDir, 'photos', String(uid)), { recursive: true });
    for (const size of ['full', 'preview'] as const) {
      const path = photoPath(dataDir, uid, photoId, size)!;
      await writeFile(path, 'x');
      const at = new Date(NOW - ageMs);
      await utimes(path, at, at);
    }
  };
  /** A meal with a full photo eaten `daysAgo` before NOW. */
  const meal = async (daysAgo: number, expiresAt: number | null) => {
    const photoId = `photo${String(++n).padStart(17, '0')}`;
    await files(photoId);
    t.db
      .prepare(
        `INSERT INTO meals (user_id, client_id, eaten_at, tz_offset_min, local_date, meal_type,
         photo_id, photo_full, photo_expires_at, created_at, updated_at)
         VALUES (?, ?, ?, 0, '2026-01-01', 'lunch', ?, 1, ?, 0, 0)`,
      )
      .run(userId, photoId, NOW - daysAgo * DAY, photoId, expiresAt);
    return photoId;
  };
  const full = (photoId: string) =>
    t.db
      .prepare('SELECT photo_full FROM meals WHERE photo_id = ?')
      .pluck()
      .get(photoId);
  const exists = (photoId: string, size: 'full' | 'preview', uid = userId) =>
    existsSync(photoPath(dataDir, uid, photoId, size)!);
  return { ...t, dataDir, userId, files, meal, full, exists };
}

describe('sweepPhotos', () => {
  it('deletes an expired full photo, keeping the preview and the meal (AC-10.3)', async () => {
    const t = await setup();
    const expired = await t.meal(31, NOW - DAY);
    const fresh = await t.meal(1, NOW + DAY);
    const forever = await t.meal(400, null);
    await sweepPhotos(t.db, t.dataDir, NOW);
    expect([t.full(expired), t.full(fresh), t.full(forever)]).toEqual([
      0, 1, 1,
    ]);
    expect(t.exists(expired, 'full')).toBe(false);
    expect(t.exists(expired, 'preview')).toBe(true);
    expect(t.exists(fresh, 'full')).toBe(true);
    expect(t.exists(forever, 'full')).toBe(true);
    // Clients learn about the dropped photo through sync.
    expect(
      t.db
        .prepare('SELECT rev FROM meals WHERE photo_id = ?')
        .pluck()
        .get(expired),
    ).toBe(1);
  });

  it('deletes files no meal owns once older than a day, and leaves other names alone', async () => {
    const t = await setup();
    const old = 'old'.padEnd(22, 'a');
    const young = 'young'.padEnd(22, 'a');
    await t.files(old, ORPHAN_AGE_MS + 1);
    await t.files(young, ORPHAN_AGE_MS - 60_000);
    const dir = join(t.dataDir, 'photos', String(t.userId));
    const tmp = join(dir, `${'tmp'.padEnd(22, 'a')}.jpg.tmp`);
    const other = join(dir, 'notes.txt');
    for (const p of [tmp, other]) {
      await writeFile(p, 'x');
      const at = new Date(NOW - 2 * DAY);
      await utimes(p, at, at);
    }
    await sweepPhotos(t.db, t.dataDir, NOW);
    expect(t.exists(old, 'full')).toBe(false);
    expect(t.exists(old, 'preview')).toBe(false);
    expect(t.exists(young, 'full')).toBe(true);
    expect(existsSync(tmp)).toBe(false);
    expect(existsSync(other)).toBe(true);
  });

  it("deletes a deleted user's folder", async () => {
    const t = await setup();
    await t.files('gone'.padEnd(22, 'a'), 0, 999);
    await mkdir(join(t.dataDir, 'photos', 'keep'));
    await sweepPhotos(t.db, t.dataDir, NOW);
    expect(existsSync(join(t.dataDir, 'photos', '999'))).toBe(false);
    expect(existsSync(join(t.dataDir, 'photos', 'keep'))).toBe(true);
  });
});

describe('photo retention API', () => {
  async function api() {
    const t = await setup();
    const res = await t.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'Correct-horse-battery-9',
      }),
    });
    const cookie = setCookie(res, 'oct_session')!.split(';')[0]!;
    const call = (method: string, path: string, body?: unknown) =>
      t.app.request(`/api/account${path}`, {
        method,
        headers: { 'content-type': 'application/json', cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const impact = async (days: string) =>
      (await (await call('GET', `/photo-retention/impact?days=${days}`)).json())
        .willDelete as number;
    // Meals are stamped relative to the real clock, which the routes use.
    const now = Date.now();
    const meal = async (daysAgo: number, days: number | null) => {
      const eatenAt = now - daysAgo * DAY;
      const id = await t.meal(0, days === null ? null : eatenAt + days * DAY);
      t.db
        .prepare('UPDATE meals SET eaten_at = ? WHERE photo_id = ?')
        .run(eatenAt, id);
      return id;
    };
    return { ...t, call, impact, meal };
  }

  it('shrinking 30 -> 7 deletes photos older than 7 days, as impact predicted (AC-10.4)', async () => {
    const t = await api();
    const old = await t.meal(10, 30);
    const recent = await t.meal(3, 30);
    expect(await t.impact('7')).toBe(1);
    expect(await t.impact('0')).toBe(2);
    expect(await t.impact('')).toBe(0);
    const res = await t.call('PUT', '/photo-retention', { days: 7 });
    expect(await res.json()).toEqual({ days: 7 });
    expect([t.full(old), t.full(recent)]).toEqual([0, 1]);
    expect(t.exists(old, 'full')).toBe(false);
    expect(await (await t.call('GET', '/settings')).json()).toMatchObject({
      photoRetentionDays: 7,
    });

    // Growing back does not bring deleted photos back.
    await t.call('PUT', '/photo-retention', { days: 90 });
    expect([t.full(old), t.full(recent)]).toEqual([0, 1]);
    expect(
      t.db
        .prepare('SELECT photo_expires_at FROM meals WHERE photo_id = ?')
        .pluck()
        .get(recent),
    ).toBe(
      (t.db
        .prepare('SELECT eaten_at FROM meals WHERE photo_id = ?')
        .pluck()
        .get(recent) as number) +
        90 * DAY,
    );
  });

  it('null keeps photos forever, also for new meals', async () => {
    const t = await api();
    const old = await t.meal(10, 30);
    await t.call('PUT', '/photo-retention', { days: null });
    expect(
      t.db.prepare('SELECT photo_expires_at FROM meals').pluck().get(),
    ).toBeNull();
    expect(t.full(old)).toBe(1);
    expect(
      t.db.prepare('SELECT photo_retention_days FROM users').pluck().get(),
    ).toBeNull();
  });

  it('rejects other periods', async () => {
    const t = await api();
    expect((await t.call('PUT', '/photo-retention', { days: 5 })).status).toBe(
      400,
    );
    expect((await t.call('GET', '/photo-retention/impact?days=5')).status).toBe(
      400,
    );
  });
});
