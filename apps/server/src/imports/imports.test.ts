import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OCT_EXPORT_VERSION } from '@oct/shared';
import { ensureAdmin } from '../auth/admin.js';
import { hashPassword } from '../auth/password.js';
import { setCookie, testApp } from '../test/app.js';
import { dataRows, MAX_IMPORT_BYTES } from './draft.js';

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
    expect((await t.upload('mfp', CSV)).status).toBe(400);
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
