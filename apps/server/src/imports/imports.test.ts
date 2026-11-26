import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Database } from 'better-sqlite3';
import { OCT_EXPORT_VERSION, sumDay } from '@oct/shared';
import { ensureAdmin } from '../auth/admin.js';
import { hashPassword } from '../auth/password.js';
import { writeZip } from '../export/zip.js';
import { setCookie, testApp } from '../test/app.js';
import { dataRows, MAX_IMPORT_BYTES } from './draft.js';
import { DRAFT_AGE_MS, sweepImports } from './sweep.js';

const BOM = String.fromCharCode(0xfeff);

const PASSWORD = 'Correct-horse-battery-9';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), 'oct-imports-'));
  dirs.push(dataDir);
  const t = testApp({ DATA_DIR: dataDir });
  await ensureAdmin(t.config, t.db);
  const signIn = async (email: string) => {
    const res = await t.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    return setCookie(res, 'oct_session')!.split(';')[0]!;
  };
  const cookie = await signIn('admin@example.com');
  const upload = (source: string, body: string | Uint8Array, as = cookie) =>
    t.app.request(`/api/imports?source=${source}`, {
      method: 'POST',
      // A text/plain body is form-like for csrf; the client sends raw bytes.
      headers: { cookie: as, 'content-type': 'application/octet-stream' },
      body,
    });
  const call = (method: string, path: string, body?: unknown, as = cookie) =>
    t.app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie: as },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const addUser = async (email: string) => {
    const { lastInsertRowid } = t.db
      .prepare(
        "INSERT INTO users (email, role, webauthn_user_id, created_at) VALUES (?, 'user', randomblob(16), 0)",
      )
      .run(email);
    t.db
      .prepare(
        'INSERT INTO passwords (user_id, hash, updated_at) VALUES (?, ?, 0)',
      )
      .run(lastInsertRowid, await hashPassword(PASSWORD));
    return signIn(email);
  };
  const files = () => readdir(join(dataDir, 'imports')).catch(() => []);
  return { ...t, dataDir, upload, call, addUser, files };
}

const CSV =
  BOM +
  'Date;Meal;Food;Calories;Protein\n' +
  '03/04/2024;Breakfast;"Oatmeal; milk";250,5;8\n' +
  '05/04/2024;Lunch;;700;\n' +
  '06/04/2024;;Tea;;\n';
const MAPPING = { columns: { date: 0, meal: 1, name: 2, kcal: 3, protein: 4 } };

const octFile = (version = OCT_EXPORT_VERSION) =>
  JSON.stringify({
    format: 'oct-export',
    version,
    exportedAt: '2026-11-21T10:00:00.000Z',
    app: '0.4.0',
    period: null,
    profile: {
      sex: null,
      birthDate: null,
      heightCm: null,
      weightKg: null,
      activity: null,
      goal: null,
      targetWeightKg: null,
      deadline: null,
    },
    norm: null,
    settings: {
      locale: 'en',
      theme: 'system',
      units: 'metric',
      offEnabled: false,
    },
    meals: [
      {
        clientId: 'a',
        localDate: '2026-11-20',
        eatenAt: '2026-11-20T05:15:00.000Z',
        tzOffsetMin: 180,
        mealType: 'breakfast',
        dishes: [
          {
            name: 'Oatmeal',
            grams: 180,
            unit: 'g',
            kcal: 250,
            proteinG: 8,
            fatG: 4,
            carbsG: 44,
            source: 'ai',
          },
          {
            name: 'Milk',
            grams: 200,
            unit: 'ml',
            kcal: 104,
            proteinG: 6,
            fatG: 5,
            carbsG: 9,
            source: 'manual',
          },
        ],
      },
    ],
    weighings: [],
  });

describe('POST /api/imports (ADR-0026 §5)', () => {
  it('keeps a CSV as a draft and offers the guessed mapping', async () => {
    const t = await setup();
    const res = await t.upload('csv', CSV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: number };
    expect(body).toEqual({
      id: body.id,
      needsMapping: true,
      headers: ['Date', 'Meal', 'Food', 'Calories', 'Protein'],
      columns: MAPPING.columns,
      sample: [
        ['03/04/2024', 'Breakfast', 'Oatmeal; milk', '250,5', '8'],
        ['05/04/2024', 'Lunch', '', '700', ''],
        ['06/04/2024', '', 'Tea', '', ''],
      ],
    });
    expect(await t.files()).toEqual([`${body.id}.tmp`]);
    expect(
      t.db
        .prepare('SELECT status, source, length(file_sha256) AS n FROM imports')
        .get(),
    ).toEqual({
      status: 'draft',
      source: 'csv',
      n: 64,
    });
  });

  it('answers an OCT file with its preview at once', async () => {
    const t = await setup();
    const res = await t.upload('oct', octFile());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      period: { from: '2026-11-20', to: '2026-11-20' },
      days: 1,
      records: 2,
      first: [
        { name: 'Oatmeal', time: '08:15', mealType: 'breakfast' },
        { name: 'Milk' },
      ],
      ambiguousDates: false,
    });
  });

  it('refuses a newer OCT version and a broken file, leaving nothing behind', async () => {
    const t = await setup();
    const newer = await t.upload('oct', octFile(OCT_EXPORT_VERSION + 1));
    expect(newer.status).toBe(400);
    expect(await newer.json()).toEqual({
      error: { code: 'export_version_unsupported' },
    });
    expect((await t.upload('oct', '{"format":')).status).toBe(400);
    expect(
      (await t.upload('oct', '{"format":"oct-export","version":1}')).status,
    ).toBe(400);
    expect((await t.upload('csv', '')).status).toBe(400);
    expect((await t.upload('fitbit', CSV)).status).toBe(400);
    expect(t.db.prepare('SELECT count(*) FROM imports').pluck().get()).toBe(0);
    expect(await t.files()).toEqual([]);
  });

  it('refuses 50 MB + 1 byte with 413 and removes the partial file', async () => {
    const t = await setup();
    const res = await t.upload('csv', new Uint8Array(MAX_IMPORT_BYTES + 1));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: { code: 'import_too_large' } });
    expect(await t.files()).toEqual([]);
  });

  it('refuses a file this user already imported with 409, but not another user', async () => {
    const t = await setup();
    await t.upload('csv', CSV);
    t.db.exec("UPDATE imports SET status = 'done'"); // the commit is OCT-404
    const again = await t.upload('csv', CSV);
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: { code: 'already_imported' } });
    const other = await t.addUser('other@example.com');
    expect((await t.upload('csv', CSV, other)).status).toBe(200);
  });

  it('needs a session', async () => {
    const t = await setup();
    expect((await t.upload('csv', CSV, '')).status).toBe(401);
  });
});

describe('PUT /api/imports/:id/mapping and GET preview', () => {
  it('previews the mapped CSV: totals, unrecognized rows and ambiguous dates', async () => {
    const t = await setup();
    const { id } = (await (await t.upload('csv', CSV)).json()) as {
      id: number;
    };
    const res = await t.call('PUT', `/imports/${id}/mapping`, MAPPING);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id,
      period: { from: '2024-04-03', to: '2024-04-05' },
      days: 2,
      records: 2,
      skippedDays: 0,
      skippedRecords: 0,
      first: [
        {
          localDate: '2024-04-03',
          time: null,
          mealType: 'breakfast',
          name: 'Oatmeal; milk',
          grams: 0,
          kcal: 250.5,
          proteinG: 8,
          fatG: 0,
          carbsG: 0,
        },
        {
          localDate: '2024-04-05',
          time: null,
          mealType: 'lunch',
          name: 'Lunch total',
          grams: 0,
          kcal: 700,
          proteinG: 0,
          fatG: 0,
          carbsG: 0,
        },
      ],
      unrecognized: { count: 1, rows: [{ line: 4, reason: 'no_kcal' }] },
      ambiguousDates: true,
    });
    const mdy = await t.call('PUT', `/imports/${id}/mapping`, {
      ...MAPPING,
      dateOrder: 'mdy',
    });
    expect(await mdy.json()).toMatchObject({
      period: { from: '2024-03-04', to: '2024-05-04' },
      ambiguousDates: false,
    });
    // The preview writes nothing.
    expect(t.db.prepare('SELECT count(*) FROM meals').pluck().get()).toBe(0);
  });

  it('skips days with entries unless includeDaysWithEntries=1', async () => {
    const t = await setup();
    t.db.exec(
      "INSERT INTO meals (user_id, client_id, eaten_at, tz_offset_min, local_date, meal_type, created_at, updated_at) VALUES (1, 'm', 0, 0, '2024-04-03', 'lunch', 0, 0)",
    );
    const { id } = (await (await t.upload('csv', CSV)).json()) as {
      id: number;
    };
    await t.call('PUT', `/imports/${id}/mapping`, {
      ...MAPPING,
      dateOrder: 'dmy',
    });
    expect(
      await (await t.call('GET', `/imports/${id}/preview`)).json(),
    ).toMatchObject({
      days: 1,
      records: 1,
      skippedDays: 1,
      skippedRecords: 1,
    });
    expect(
      await (
        await t.call('GET', `/imports/${id}/preview?includeDaysWithEntries=1`)
      ).json(),
    ).toMatchObject({ days: 2, records: 2, skippedDays: 0 });
  });

  it('refuses a mapping without date, name or kcal, or past the last column', async () => {
    const t = await setup();
    const { id } = (await (await t.upload('csv', CSV)).json()) as {
      id: number;
    };
    const put = (columns: object) =>
      t.call('PUT', `/imports/${id}/mapping`, { columns });
    expect((await put({ date: 0, name: 2 })).status).toBe(400);
    expect((await put({ name: 2, kcal: 3 })).status).toBe(400);
    expect((await put({ date: 0, kcal: 3 })).status).toBe(400);
    expect((await put({ date: 0, name: 2, kcal: 9 })).status).toBe(400);
    // No mapping yet: nothing to preview.
    expect((await t.call('GET', `/imports/${id}/preview`)).status).toBe(400);
  });

  it("answers 404 for another user's or a done draft", async () => {
    const t = await setup();
    const { id } = (await (await t.upload('csv', CSV)).json()) as {
      id: number;
    };
    const other = await t.addUser('other@example.com');
    expect(
      (await t.call('PUT', `/imports/${id}/mapping`, MAPPING, other)).status,
    ).toBe(404);
    expect(
      (await t.call('GET', `/imports/${id}/preview`, undefined, other)).status,
    ).toBe(404);
    t.db.exec("UPDATE imports SET status = 'done'");
    expect((await t.call('GET', `/imports/${id}/preview`)).status).toBe(404);
  });
});

const fixture = (name: string) =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url));

async function zipOf(entries: [string, Buffer][]) {
  const chunks: Uint8Array[] = [];
  for await (const c of writeZip(
    entries.map(([name, data]) => ({
      name,
      size: data.length,
      data: () => [data],
    })),
    new Date(),
  ))
    chunks.push(c);
  return Buffer.concat(chunks);
}

describe('MyFitnessPal and Cronometer exports (ADR-0026 §6)', () => {
  it('previews an MFP nutrition summary as meal totals, from a CSV or the export ZIP', async () => {
    const t = await setup();
    const csv = await fixture('mfp-nutrition-summary.csv');
    const expected = {
      period: { from: '2024-03-04', to: '2024-03-05' },
      days: 2,
      records: 5,
      first: [
        {
          localDate: '2024-03-04',
          time: '08:12',
          mealType: 'breakfast',
          name: 'Breakfast total',
          grams: 0,
          kcal: 412.5,
          proteinG: 18.2,
          fatG: 12.1,
          carbsG: 55.3,
        },
        { name: 'Lunch total', time: '13:05' },
        { name: 'Snack total', time: null },
        { name: 'Dinner total' },
        // A renamed meal: placed by its time.
        { name: 'Dinner total', time: '21:30' },
      ],
      unrecognized: { count: 0, rows: [] },
    };
    const res = await t.upload('mfp', csv);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject(expected);

    const zip = await zipOf([
      ['Exercise-Summary-2024-03-04-to-2024-03-05.csv', Buffer.from('x\n')],
      ['Nutrition-Summary-2024-03-04-to-2024-03-05.csv', csv],
    ]);
    const fromZip = await t.upload('mfp', zip);
    expect(fromZip.status).toBe(200);
    const body = (await fromZip.json()) as { id: number };
    expect(body).toMatchObject(expected);

    const commit = await t.call('POST', `/imports/${body.id}/commit`, {});
    expect(await commit.json()).toEqual({ records: 5 });
    expect(
      t.db
        .prepare("SELECT count(*) FROM meal_items WHERE trim(name) = ''")
        .pluck()
        .get(),
    ).toBe(0);
    // The same ZIP again is the same file.
    expect((await t.upload('mfp', zip)).status).toBe(409);
  });

  it('previews Cronometer servings with grams from the amount, kcal by header', async () => {
    const t = await setup();
    const res = await t.upload(
      'cronometer',
      await fixture('cronometer-servings.csv'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      period: { from: '2024-03-04', to: '2024-03-05' },
      days: 2,
      records: 5,
      first: [
        {
          time: '08:10',
          mealType: 'breakfast',
          name: 'Oats, Rolled',
          grams: 50,
          kcal: 189.5,
          proteinG: 6.6,
          fatG: 3.3,
          carbsG: 33.8,
        },
        { name: 'Milk, 2%', grams: 0, kcal: 122 },
        { name: 'Chicken Breast, Roasted', mealType: 'lunch' },
        // «Uncategorized» without a time is a snack.
        { name: 'Apple', mealType: 'snack', grams: 182 },
        { name: 'Rice, White, Cooked', mealType: 'dinner' },
      ],
    });
  });

  it('refuses files that are not the source export, leaving nothing behind', async () => {
    const t = await setup();
    const csv = await fixture('mfp-nutrition-summary.csv');
    for (const [source, body] of [
      ['mfp', 'Date;Food;Calories\n2024-03-04;Tea;5\n'],
      ['cronometer', csv],
      ['mfp', await zipOf([['Exercise-Summary.csv', csv]])],
      ['mfp', Buffer.from('PK\x03\x04 broken')],
    ] as const) {
      const res = await t.upload(source, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { code: 'validation_failed' },
      });
    }
    expect(await t.files()).toEqual([]);
    expect(t.db.prepare('SELECT count(*) FROM imports').pluck().get()).toBe(0);
  });

  it('keeps the mapping fixed: PUT mapping is only for «Other CSV»', async () => {
    const t = await setup();
    const { id } = (await (
      await t.upload('mfp', await fixture('mfp-nutrition-summary.csv'))
    ).json()) as { id: number };
    expect(
      (await t.call('PUT', `/imports/${id}/mapping`, MAPPING)).status,
    ).toBe(400);
  });
});

describe('dataRows', () => {
  it('stops at the row limit with 413 without reading on', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'oct-rows-'));
    dirs.push(dir);
    const path = join(dir, 'f.csv');
    await writeFile(path, 'a\n1\n2\n3\n');
    const read = async (max: number) => {
      const lines: number[] = [];
      for await (const { line } of dataRows(path, max)) lines.push(line);
      return lines;
    };
    expect(await read(3)).toEqual([2, 3, 4]);
    await expect(read(2)).rejects.toMatchObject({
      status: 413,
      code: 'import_too_large',
    });
  });
});

type Totals = Record<string, ReturnType<typeof sumDay>>;
/** Each day's totals from the stored dishes, as the diary sums them. */
const dayTotals = (t: { db: Database }, userId: number): Totals => {
  const rows = t.db
    .prepare(
      `SELECT m.local_date AS day, i.kcal, i.protein_g AS proteinG, i.fat_g AS fatG, i.carbs_g AS carbsG
       FROM meals m JOIN meal_items i ON i.meal_id = m.id WHERE m.user_id = ? ORDER BY i.id`,
    )
    .all(userId) as ({ day: string } & Parameters<typeof sumDay>[0][0])[];
  const days: Record<string, typeof rows> = {};
  for (const r of rows) (days[r.day] ??= []).push(r);
  return Object.fromEntries(
    Object.entries(days).map(([d, items]) => [d, sumDay(items)]),
  );
};

const meal = (localDate: string, eatenAt: string, kcal: number) => ({
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
      proteinG: 9.3,
      fatG: 4.1,
      carbsG: 20.05,
      source: 'ai',
    },
    {
      name: 'Juice',
      grams: 200,
      unit: 'ml',
      kcal: 90,
      proteinG: 0,
      fatG: 0,
      carbsG: 21,
      source: 'manual',
    },
  ],
});

const userIdOf = (t: { db: Database }, email: string) =>
  t.db
    .prepare('SELECT id FROM users WHERE email = ?')
    .pluck()
    .get(email) as number;

describe('POST /api/imports/:id/commit', () => {
  it('round-trips an export into an empty user with the same day totals', async () => {
    const t = await setup();
    for (const m of [
      meal('2026-01-10', '2026-01-10T09:00:00.000Z', 412.3),
      meal('2026-01-10', '2026-01-10T16:30:00.000Z', 120.7),
      meal('2026-01-11', '2026-01-11T07:00:00.000Z', 333.33),
    ])
      expect((await t.call('POST', '/meals', m)).status).toBe(201);
    const file = await (await t.call('GET', '/export?format=json')).text();

    const other = await t.addUser('b@example.com');
    const draft = (await (await t.upload('oct', file, other)).json()) as {
      id: number;
    };
    const res = await t.call(`POST`, `/imports/${draft.id}/commit`, {}, other);
    expect(await res.json()).toEqual({ records: 6 });

    const b = userIdOf(t, 'b@example.com');
    expect(dayTotals(t, b)).toEqual(
      dayTotals(t, userIdOf(t, 'admin@example.com')),
    );
    expect(
      t.db
        .prepare(
          `SELECT DISTINCT m.client_id, i.source FROM meals m JOIN meal_items i ON i.meal_id = m.id
           WHERE m.user_id = ? ORDER BY m.client_id`,
        )
        .raw()
        .all(b),
    ).toEqual([1, 2, 3].map((n) => [`import:${draft.id}:${n}`, 'import']));
    // The file is gone, the import is in the history.
    expect(await t.files()).toEqual([]);
    const history = (await (
      await t.call('GET', '/imports', undefined, other)
    ).json()) as unknown[];
    expect(history).toEqual([
      {
        id: draft.id,
        source: 'oct',
        committedAt: expect.any(Number),
        records: 6,
      },
    ]);
    expect(await (await t.call('GET', '/imports')).json()).toEqual([]);
  });

  it('writes nothing twice on a repeat', async () => {
    const t = await setup();
    const { id } = (await (await t.upload('oct', octFile())).json()) as {
      id: number;
    };
    const commit = () => t.call('POST', `/imports/${id}/commit`, {});
    expect(await (await commit()).json()).toEqual({ records: 2 });
    expect(await (await commit()).json()).toEqual({ records: 2 });
    expect(t.db.prepare('SELECT count(*) FROM meals').pluck().get()).toBe(1);
    expect(t.db.prepare('SELECT count(*) FROM meal_items').pluck().get()).toBe(
      2,
    );
  });

  it('skips days with entries unless asked, and places CSV times by the browser zone', async () => {
    const t = await setup();
    const mapping = { ...MAPPING, dateOrder: 'dmy' };
    // User b has a meal on 3 April 2024: only the 5 April dish is written.
    const b = await t.addUser('b@example.com');
    await t.call(
      'POST',
      '/meals',
      meal('2024-04-03', '2024-04-03T09:00:00.000Z', 100),
      b,
    );
    const skip = (await (await t.upload('csv', CSV, b)).json()) as {
      id: number;
    };
    await t.call('PUT', `/imports/${skip.id}/mapping`, mapping, b);
    expect(
      await (await t.call('POST', `/imports/${skip.id}/commit`, {}, b)).json(),
    ).toEqual({ records: 1 });

    const { id } = (await (await t.upload('csv', CSV)).json()) as {
      id: number;
    };
    await t.call('PUT', `/imports/${id}/mapping`, mapping);
    await t.call(
      'POST',
      '/meals',
      meal('2024-04-03', '2024-04-03T09:00:00.000Z', 100),
    );
    const res = await t.call('POST', `/imports/${id}/commit`, {
      includeDaysWithEntries: true,
      tzOffsetMin: 180,
    });
    expect(await res.json()).toEqual({ records: 2 });
    expect(
      t.db
        .prepare(
          "SELECT local_date, eaten_at, tz_offset_min, meal_type, logged_at, recognized FROM meals WHERE import_id = ? AND local_date = '2024-04-03'",
        )
        .get(id),
    ).toEqual({
      local_date: '2024-04-03',
      // No time in the file: noon local, 09:00 UTC at +3.
      eaten_at: Date.parse('2024-04-03T09:00:00.000Z'),
      tz_offset_min: 180,
      meal_type: 'breakfast',
      // Imported history counts as logged when eaten, not as a backfill (ADR-0032 §2).
      logged_at: Date.parse('2024-04-03T09:00:00.000Z'),
      recognized: 0,
    });
  });

  it("answers 404 for another user's draft", async () => {
    const t = await setup();
    const { id } = (await (await t.upload('oct', octFile())).json()) as {
      id: number;
    };
    const other = await t.addUser('b@example.com');
    expect(
      (await t.call('POST', `/imports/${id}/commit`, {}, other)).status,
    ).toBe(404);
    expect(
      (await t.call('GET', `/imports/${id}/delete-info`, undefined, other))
        .status,
    ).toBe(404);
  });
});

describe('DELETE /api/imports/:id', () => {
  it('counts edited meals, deletes with tombstones that sync sends, and is idempotent', async () => {
    const t = await setup();
    const file = JSON.parse(octFile()) as { meals: unknown[] };
    const second = {
      ...(file.meals[0] as object),
      clientId: 'b',
      localDate: '2026-11-19',
      eatenAt: '2026-11-19T05:15:00.000Z',
    };
    file.meals.push(second);
    const { id } = (await (
      await t.upload('oct', JSON.stringify(file))
    ).json()) as { id: number };
    await t.call('POST', `/imports/${id}/commit`, {});
    expect(
      await (await t.call('GET', `/imports/${id}/delete-info`)).json(),
    ).toEqual({
      records: 4,
      edited: 0,
      days: 2,
    });

    const mealId = t.db
      .prepare('SELECT id FROM meals WHERE client_id = ?')
      .pluck()
      .get(`import:${id}:1`) as number;
    // Edited a millisecond after the commit at the earliest.
    t.db
      .prepare(
        'UPDATE imports SET committed_at = committed_at - 1 WHERE id = ?',
      )
      .run(id);
    expect(
      (await t.call('PATCH', `/meals/${mealId}`, { mealType: 'dinner' }))
        .status,
    ).toBe(200);
    expect(
      await (await t.call('GET', `/imports/${id}/delete-info`)).json(),
    ).toEqual({
      records: 4,
      edited: 1,
      days: 2,
    });

    const { rev } = (await (await t.call('GET', '/sync?since=0')).json()) as {
      rev: number;
    };
    expect((await t.call('DELETE', `/imports/${id}`)).status).toBe(204);
    expect(t.db.prepare('SELECT count(*) FROM meals').pluck().get()).toBe(0);
    expect(t.db.prepare('SELECT count(*) FROM imports').pluck().get()).toBe(0);
    const sync = (await (await t.call('GET', `/sync?since=${rev}`)).json()) as {
      deletedMealClientIds: string[];
    };
    expect(sync.deletedMealClientIds.sort()).toEqual([
      `import:${id}:1`,
      `import:${id}:2`,
    ]);
    expect((await t.call('DELETE', `/imports/${id}`)).status).toBe(204);
    expect((await t.call('DELETE', '/imports/abc')).status).toBe(204);
  });

  it("leaves another user's import alone", async () => {
    const t = await setup();
    const { id } = (await (await t.upload('oct', octFile())).json()) as {
      id: number;
    };
    await t.call('POST', `/imports/${id}/commit`, {});
    const other = await t.addUser('b@example.com');
    expect(
      (await t.call('DELETE', `/imports/${id}`, undefined, other)).status,
    ).toBe(204);
    expect(t.db.prepare('SELECT count(*) FROM meals').pluck().get()).toBe(1);
  });
});

describe('sweepImports', () => {
  it('deletes drafts and stray files older than a day, keeping fresh ones', async () => {
    const t = await setup();
    const upload = async (body: string) =>
      ((await (await t.upload('csv', body)).json()) as { id: number }).id;
    const old = await upload(CSV);
    const fresh = await upload(CSV + '07/04/2024;;Tea;5;\n');
    const now = Date.now();
    t.db
      .prepare('UPDATE imports SET created_at = ? WHERE id = ?')
      .run(now - DRAFT_AGE_MS - 1, old);
    const dir = join(t.dataDir, 'imports');
    const day = new Date(now - DRAFT_AGE_MS - 60_000);
    await writeFile(join(dir, `${randomUUID()}.part`), 'x');
    const stale = `${randomUUID()}.part`;
    await writeFile(join(dir, stale), 'x');
    await utimes(join(dir, stale), day, day);
    await writeFile(join(dir, '999.tmp'), 'x');
    await utimes(join(dir, '999.tmp'), day, day);

    await sweepImports(t.db, t.dataDir, now);
    expect(t.db.prepare('SELECT id FROM imports').pluck().all()).toEqual([
      fresh,
    ]);
    const left = await t.files();
    expect(left).toContain(`${fresh}.tmp`);
    expect(left).not.toContain(`${old}.tmp`);
    expect(left).not.toContain(stale);
    expect(left).not.toContain('999.tmp');
    expect(left).toHaveLength(2);
  });

  it("removes a deleted user's draft files", async () => {
    const t = await setup();
    const other = await t.addUser('b@example.com');
    await t.upload('csv', CSV, other);
    expect(await t.files()).toHaveLength(1);
    const res = await t.call(
      'DELETE',
      `/admin/users/${userIdOf(t, 'b@example.com')}`,
    );
    expect(res.status).toBe(204);
    expect(await t.files()).toEqual([]);
  });
});
