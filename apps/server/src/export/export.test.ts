import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { octExportSchema, type MealInput, type OctExport } from '@oct/shared';
import { sweepPhotos } from '../photos/sweep.js';
import { aiSetup } from '../test/ai.js';
import { csvField } from './build.js';
import { writeZip, zipSize, type ZipEntry } from './zip.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((f) => f()));
});

async function readAll(gen: AsyncIterable<Uint8Array>) {
  const parts: Uint8Array[] = [];
  for await (const p of gen) parts.push(p);
  return Buffer.concat(parts);
}

/** Runs `unzip` on the archive: `-t` tests it, `-p` with a name prints that entry. */
async function unzip(zip: Buffer, flag: '-t' | '-p', name?: string) {
  const dir = await mkdtemp(join(tmpdir(), 'oct-zip-'));
  cleanups.push(() => rm(dir, { recursive: true }));
  const file = join(dir, 'a.zip');
  await writeFile(file, zip);
  return execFileSync('unzip', [flag, file, ...(name ? [name] : [])], {
    encoding: 'utf8',
  });
}
const entry = (zip: Buffer, name: string) => unzip(zip, '-p', name);

describe('writeZip', () => {
  it('writes an archive unzip accepts, of exactly zipSize bytes', async () => {
    const big = Buffer.alloc(200_000, 7);
    const entries: ZipEntry[] = [
      { name: 'a.txt', size: 5, data: () => [Buffer.from('hello')] },
      { name: 'empty', size: 0, data: () => [] },
      {
        name: 'photos/b.jpg',
        size: big.length,
        data: () => [big.subarray(0, 1000), big.subarray(1000)],
      },
    ];
    const zip = await readAll(
      writeZip(entries, new Date('2026-11-21T10:00:00Z')),
    );
    expect(zip.length).toBe(zipSize(entries));
    expect(await unzip(zip, '-t')).toContain('No errors detected');
  });

  it('breaks off when an entry has another size than announced', async () => {
    const gen = writeZip(
      [{ name: 'a', size: 3, data: () => [Buffer.from('abcd')] }],
      new Date(),
    );
    await expect(readAll(gen)).rejects.toThrow('changed size');
  });
});

describe('csvField', () => {
  it('quotes by RFC 4180', () => {
    expect(csvField('Soup, "hot"\nbowl')).toBe('"Soup, ""hot""\nbowl"');
    expect(csvField('Tea')).toBe('Tea');
    expect(csvField(183.4)).toBe('183.4');
  });
});

const meal = (patch: Partial<MealInput> = {}): MealInput => ({
  clientId: randomUUID(),
  eatenAt: '2026-11-20T08:15:00.000Z',
  tzOffsetMin: 180,
  localDate: '2026-11-20',
  mealType: 'breakfast',
  items: [
    {
      name: 'Soup, "hot"\nbowl',
      grams: 183.4,
      kcal: 250.37,
      proteinG: 8.1,
      fatG: 4.4,
      carbsG: 44.12,
      source: 'manual',
    },
    {
      name: 'Milk',
      grams: 200,
      unit: 'ml',
      kcal: 104,
      proteinG: 6,
      fatG: 5,
      carbsG: 9.4,
      source: 'manual',
    },
  ],
  ...patch,
});

async function setup() {
  const t = await aiSetup(null);
  cleanups.push(t.cleanup);
  const get = (path: string, cookie = t.cookie) =>
    t.app.request(`/api${path}`, { headers: { cookie } });
  const post = (body: unknown, cookie = t.cookie) =>
    t.app.request('/api/meals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    });
  const download = async (path: string) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    const body = Buffer.from(await res.arrayBuffer());
    expect(Number(res.headers.get('content-length'))).toBe(body.length);
    return { res, body };
  };
  return { ...t, get, post, download };
}

describe('GET /api/export', () => {
  it('exports JSON that passes the schema, by period and without others’ meals', async () => {
    const t = await setup();
    expect((await t.post(meal())).status).toBe(201);
    await t.post(
      meal({ localDate: '2026-10-01', eatenAt: '2026-10-01T08:00:00.000Z' }),
    );
    const other = await t.signIn('b@example.com');
    await t.post(meal({ mealType: 'dinner' }), other);
    await t.app.request('/api/weighings/2026-11-20', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: t.cookie },
      body: JSON.stringify({ weightKg: 62.4 }),
    });

    const { res, body } = await t.download(
      '/export?from=2026-11-01&to=2026-11-30',
    );
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="oct-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    const file = octExportSchema.parse(JSON.parse(body.toString()));
    expect(file.period).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(file.meals).toHaveLength(1);
    expect(file.meals[0]).toMatchObject({
      mealType: 'breakfast',
      localDate: '2026-11-20',
    });
    expect(file.meals[0]!.dishes.map((d) => d.unit)).toEqual(['g', 'ml']);
    expect(file.meals[0]).not.toHaveProperty('photo');

    const all = JSON.parse(
      (await t.download('/export')).body.toString(),
    ) as OctExport;
    expect(all.period).toBeNull();
    expect(all.meals).toHaveLength(2);

    expect(await (await t.get('/integrations')).json()).toMatchObject({
      export: { lastAt: expect.any(String), lastFormat: 'json' },
    });
  });

  it('exports CSV in a ZIP: BOM, RFC 4180 quoting, local time', async () => {
    const t = await setup();
    await t.post(meal());
    const { res, body } = await t.download('/export?format=csv');
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(await unzip(body, '-t')).toContain('No errors detected');
    const csv = await entry(body, 'meals.csv');
    expect(csv).toBe(
      '\ufeffdate,time,meal,name,grams,unit,kcal,protein_g,fat_g,carbs_g,source,photo\r\n' +
        '2026-11-20,11:15,breakfast,"Soup, ""hot""\nbowl",183.4,g,250.37,8.1,4.4,44.12,manual,\r\n' +
        '2026-11-20,11:15,breakfast,Milk,200,ml,104,6,5,9.4,manual,\r\n',
    );
    expect(await entry(body, 'weighings.csv')).toBe('\ufeffdate,weight_kg\r\n');
    expect(await (await t.get('/integrations')).json()).toMatchObject({
      export: { lastFormat: 'csv' },
    });
  });

  it('adds photos only when asked: the full one, else the preview', async () => {
    const t = await setup();
    const full = await t.upload();
    const expiring = await t.upload();
    await t.post(meal({ photoId: full }));
    await t.post(meal({ photoId: expiring, mealType: 'lunch' }));
    t.db
      .prepare('UPDATE meals SET photo_expires_at = 1 WHERE photo_id = ?')
      .run(expiring);
    await sweepPhotos(t.db, t.dataDir, Date.now());

    const summary = await (await t.get('/export/summary?photos=1')).json();
    const { res, body } = await t.download('/export?photos=1');
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(summary).toEqual({
      days: 1,
      dishes: 4,
      photos: 2,
      bytes: body.length,
    });
    const list = await unzip(body, '-t');
    expect(list).toContain('No errors detected');
    const file = octExportSchema.parse(
      JSON.parse(await entry(body, 'oct-export.json')),
    );
    expect(file.meals.map((m) => m.photo)).toEqual([
      `photos/${full}.jpg`,
      `photos/${expiring}.webp`,
    ]);
    expect(list).toContain(`photos/${full}.jpg`);
    expect(list).toContain(`photos/${expiring}.webp`);

    const csv = (
      await entry(
        (await t.download('/export?format=csv&photos=1')).body,
        'meals.csv',
      )
    ).toString();
    expect(csv).toContain(`,photos/${full}.jpg\r\n`);

    expect(await (await t.get('/export/summary')).json()).toMatchObject({
      photos: 0,
    });
  });

  it('rejects a half-open or reversed period and a request without a session', async () => {
    const t = await setup();
    expect((await t.get('/export?from=2026-11-01')).status).toBe(400);
    expect((await t.get('/export?from=2026-11-02&to=2026-11-01')).status).toBe(
      400,
    );
    expect((await t.get('/export?format=xml')).status).toBe(400);
    expect((await t.get('/export', '')).status).toBe(401);
    expect((await t.get('/export/summary', '')).status).toBe(401);
  });

  it('exports a year of 4 meals × 3 dishes a day in under 2 s', async () => {
    const t = await setup();
    const userId = t.db
      .prepare("SELECT id FROM users WHERE email = 'admin@example.com'")
      .pluck()
      .get();
    const addMeal = t.db.prepare(
      `INSERT INTO meals (user_id, client_id, eaten_at, tz_offset_min, local_date, meal_type, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, 0, 0)`,
    );
    const addItem = t.db.prepare(
      `INSERT INTO meal_items (meal_id, position, name, name_key, grams, kcal, protein_g, fat_g, carbs_g, source)
       VALUES (?, ?, 'Dish', 'dish', 100, 200, 10, 5, 20, 'manual')`,
    );
    t.db.transaction(() => {
      const start = Date.parse('2025-01-01T00:00:00Z');
      for (let d = 0; d < 365; d++)
        for (const [i, type] of [
          'breakfast',
          'lunch',
          'dinner',
          'snack',
        ].entries()) {
          const at = start + d * 86_400_000 + i * 3_600_000;
          const id = addMeal.run(
            userId,
            randomUUID(),
            at,
            new Date(at).toISOString().slice(0, 10),
            type,
          ).lastInsertRowid;
          for (let p = 0; p < 3; p++) addItem.run(id, p);
        }
    })();

    for (const format of ['json', 'csv']) {
      const started = performance.now();
      await t.download(`/export?format=${format}`);
      expect(performance.now() - started).toBeLessThan(2000);
    }
    const file = JSON.parse(
      (await t.download('/export')).body.toString(),
    ) as OctExport;
    expect(file.meals).toHaveLength(365 * 4);
  });
});
