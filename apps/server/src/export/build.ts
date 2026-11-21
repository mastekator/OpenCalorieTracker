import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Database } from 'better-sqlite3';
import {
  MEALS_CSV_HEADER,
  OCT_EXPORT_VERSION,
  WEIGHINGS_CSV_HEADER,
  type ExportQuery,
  type OctExport,
  type OctExportMeal,
} from '@oct/shared';
import { readSettings } from '../account/routes.js';
import { photoPath, type PhotoSize } from '../photos/store.js';
import { readProfile } from '../profile/norm.js';
import { appVersion } from '../version.js';
import { zipSize, type ZipEntry } from './zip.js';

interface Row {
  mealId: number;
  clientId: string;
  localDate: string;
  eatenAt: number;
  tzOffsetMin: number;
  mealType: OctExportMeal['mealType'];
  photoId: string | null;
  photoFull: number;
  photoExpiresAt: number | null;
  name: string;
  grams: number;
  unit: 'g' | 'ml';
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  source: OctExportMeal['dishes'][number]['source'];
  illustration: OctExportMeal['dishes'][number]['illustration'] | null;
}

/** What GET /export streams and GET /export/summary reports (ADR-0026 §2–3). */
export interface ExportPlan {
  days: number;
  dishes: number;
  photos: number;
  bytes: number;
  /** JSON without photos is sent as is, everything else as a ZIP of these entries. */
  json?: Buffer;
  entries: ZipEntry[];
}

const BOM = '\ufeff';

/** RFC 4180: quote a field holding a comma, a quote or a line break; double the quotes. */
export const csvField = (v: string | number) => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const csvLine = (fields: (string | number)[]) =>
  fields.map(csvField).join(',') + '\r\n';

const isoDateTime = (ms: number) => new Date(ms).toISOString();

/** Reads the user's diary for `q` and lays out the export; the database is read in one synchronous pass. */
export async function planExport(
  db: Database,
  dataDir: string,
  userId: number,
  q: ExportQuery,
  now: Date,
): Promise<ExportPlan> {
  const period = q.from && q.to ? { from: q.from, to: q.to } : null;
  const params = { userId, from: period?.from ?? null, to: period?.to ?? null };
  const inPeriod = (col: string) =>
    `(@from IS NULL OR ${col} BETWEEN @from AND @to)`;

  // shortcut: the text part is built in memory (a few MB for years of meals); stream it if diaries get far bigger.
  const meals: OctExportMeal[] = [];
  // Meals with a photo; `full` is false once the full photo expired.
  const withPhoto: { meal: OctExportMeal; id: string; full: boolean }[] = [];
  let dishes = 0;
  let last: number | undefined;
  for (const r of db
    .prepare(
      `SELECT m.id AS mealId, m.client_id AS clientId, m.local_date AS localDate, m.eaten_at AS eatenAt,
         m.tz_offset_min AS tzOffsetMin, m.meal_type AS mealType, m.photo_id AS photoId,
         m.photo_full AS photoFull, m.photo_expires_at AS photoExpiresAt,
         i.name, i.grams, i.unit, i.kcal, i.protein_g AS proteinG, i.fat_g AS fatG,
         i.carbs_g AS carbsG, i.source, i.illustration
       FROM meals m JOIN meal_items i ON i.meal_id = m.id
       WHERE m.user_id = @userId AND ${inPeriod('m.local_date')}
       ORDER BY m.local_date, m.eaten_at, m.id, i.position`,
    )
    .iterate(params) as IterableIterator<Row>) {
    if (r.mealId !== last) {
      last = r.mealId;
      const meal: OctExportMeal = {
        clientId: r.clientId,
        localDate: r.localDate,
        eatenAt: isoDateTime(r.eatenAt),
        tzOffsetMin: r.tzOffsetMin,
        mealType: r.mealType,
        dishes: [],
      };
      meals.push(meal);
      if (r.photoId)
        withPhoto.push({
          meal,
          id: r.photoId,
          // An expired full photo the sweep has not removed yet counts as gone.
          full:
            r.photoFull === 1 &&
            (r.photoExpiresAt === null || r.photoExpiresAt > now.getTime()),
        });
    }
    dishes++;
    meals.at(-1)!.dishes.push({
      name: r.name,
      grams: r.grams,
      unit: r.unit,
      kcal: r.kcal,
      proteinG: r.proteinG,
      fatG: r.fatG,
      carbsG: r.carbsG,
      source: r.source,
      // Only a choice made by hand; the automatic one follows from the name.
      ...(r.illustration ? { illustration: r.illustration } : {}),
    });
  }
  const weighings = db
    .prepare(
      `SELECT date, weight_kg AS weightKg FROM weighings
       WHERE user_id = @userId AND weight_kg IS NOT NULL AND ${inPeriod('date')} ORDER BY date`,
    )
    .all(params) as OctExport['weighings'];
  const { profile, manual } = readProfile(db, userId);
  const settings = readSettings(db, userId);

  const photos: ZipEntry[] = [];
  if (q.photos === '1') {
    for (const { meal, id, full } of withPhoto) {
      const sizes: PhotoSize[] = full ? ['full', 'preview'] : ['preview'];
      for (const size of sizes) {
        const path = photoPath(dataDir, userId, id, size);
        const st = path && (await stat(path).catch(() => null));
        if (!path || !st) continue;
        meal.photo = `photos/${id}.${size === 'full' ? 'jpg' : 'webp'}`;
        photos.push({
          name: meal.photo,
          size: st.size,
          data: () => createReadStream(path),
        });
        break;
      }
    }
  }

  const text: { name: string; data: Buffer }[] = [];
  if (q.format === 'json') {
    const file: OctExport = {
      format: 'oct-export',
      version: OCT_EXPORT_VERSION,
      exportedAt: now.toISOString(),
      app: appVersion,
      period,
      profile,
      norm: manual,
      settings: {
        locale: settings.locale,
        theme: settings.theme,
        units: settings.units,
        offEnabled: settings.offEnabled,
      },
      meals,
      weighings,
    };
    text.push({
      name: 'oct-export.json',
      data: Buffer.from(JSON.stringify(file)),
    });
  } else {
    let csv = BOM + csvLine([...MEALS_CSV_HEADER]);
    for (const m of meals) {
      // Local time on the device: eatenAt shifted by its offset, read as UTC.
      const time = new Date(Date.parse(m.eatenAt) + m.tzOffsetMin * 60_000)
        .toISOString()
        .slice(11, 16);
      for (const d of m.dishes)
        csv += csvLine([
          m.localDate,
          time,
          m.mealType,
          d.name,
          d.grams,
          d.unit,
          d.kcal,
          d.proteinG,
          d.fatG,
          d.carbsG,
          d.source,
          m.photo ?? '',
        ]);
    }
    text.push({ name: 'meals.csv', data: Buffer.from(csv) });
    text.push({
      name: 'weighings.csv',
      data: Buffer.from(
        BOM +
          csvLine([...WEIGHINGS_CSV_HEADER]) +
          weighings.map((w) => csvLine([w.date, w.weightKg])).join(''),
      ),
    });
  }

  const counts = {
    days: new Set(meals.map((m) => m.localDate)).size,
    dishes,
    photos: photos.length,
  };
  if (q.format === 'json' && q.photos === '0')
    return {
      ...counts,
      bytes: text[0]!.data.length,
      json: text[0]!.data,
      entries: [],
    };
  const entries: ZipEntry[] = [
    ...text.map(({ name, data }) => ({
      name,
      size: data.length,
      data: () => [data],
    })),
    ...photos,
  ];
  return { ...counts, bytes: zipSize(entries), entries };
}
