import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  OCT_EXPORT_VERSION,
  octExportSchema,
  type Locale,
  type OctExport,
} from '@oct/shared';
import { ApiError } from '../http/errors.js';
import { csvRows } from './csv.js';
import {
  guessDateOrder,
  MAX_IMPORT_ROWS,
  summarize,
  toRecord,
  type ImportRecord,
  type Mapping,
  type Preview,
  type RowReason,
} from './rules.js';

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/** `<DATA_DIR>/imports`: uploads in flight (`.part`) and drafts (`<id>.tmp`). */
export const importsDir = (dataDir: string) => join(dataDir, 'imports');
export const draftPath = (dataDir: string, id: number) =>
  join(importsDir(dataDir), `${id}.tmp`);

/** A whole OCT JSON file (ADR-0026 §6): a newer version is refused before the schema runs. */
export async function readOct(path: string): Promise<OctExport> {
  let data: unknown;
  try {
    data = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new ApiError(400, 'validation_failed');
  }
  const version = (data as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version > OCT_EXPORT_VERSION)
    throw new ApiError(400, 'export_version_unsupported');
  const result = octExportSchema.safeParse(data);
  if (!result.success) throw new ApiError(400, 'validation_failed');
  return result.data;
}

/** Data rows after the header with their 1-based line (header = 1); past `maxRows` → 413 at once. */
export async function* dataRows(path: string, maxRows = MAX_IMPORT_ROWS) {
  let line = 0;
  for await (const row of csvRows(
    createReadStream(path, { encoding: 'utf8' }),
  )) {
    if (++line === 1) continue;
    if (line - 1 > maxRows) throw new ApiError(413, 'import_too_large');
    yield { line, row };
  }
}

/** The header row and the first rows for the mapping screen; an empty file is 400. */
export async function csvHead(path: string, sampleRows = 5) {
  const rows: string[][] = [];
  for await (const row of csvRows(
    createReadStream(path, { encoding: 'utf8' }),
  )) {
    rows.push(row);
    if (rows.length > sampleRows) break;
  }
  const [headers, ...sample] = rows;
  if (!headers) throw new ApiError(400, 'validation_failed');
  return { headers, sample };
}

type Row = { line: number; record: ImportRecord | RowReason };

async function* octRows(data: OctExport): AsyncGenerator<Row> {
  let line = 0;
  for (const meal of data.meals) {
    line++;
    // Local time of the meal: tzOffsetMin is east-positive.
    const time = new Date(Date.parse(meal.eatenAt) + meal.tzOffsetMin * 60_000)
      .toISOString()
      .slice(11, 16);
    for (const d of meal.dishes)
      yield {
        line,
        record: {
          localDate: meal.localDate,
          time,
          mealType: meal.mealType,
          name: d.name,
          grams: d.grams,
          kcal: d.kcal,
          proteinG: d.proteinG,
          fatG: d.fatG,
          carbsG: d.carbsG,
        },
      };
  }
}

/** The CSV rows as dishes, the same for the preview and the commit; the date order is guessed when unset. */
export async function csvRecords(path: string, draft: Draft, locale: Locale) {
  const { mapping } = draft;
  if (!mapping) throw new ApiError(400, 'validation_failed');
  const { headers } = await csvHead(path, 0);
  let dateOrder = mapping.dateOrder;
  let ambiguousDates = false;
  if (!dateOrder) {
    const dates = async function* () {
      for await (const { row } of dataRows(path))
        yield row[mapping.columns.date] ?? '';
    };
    ({ order: dateOrder, ambiguous: ambiguousDates } =
      await guessDateOrder(dates()));
  }
  const ctx = {
    columns: mapping.columns,
    headers,
    dateOrder,
    decimal: mapping.decimal,
    locale,
  };
  async function* rows(): AsyncGenerator<Row> {
    for await (const { line, row } of dataRows(path))
      yield { line, record: toRecord(row, ctx) };
  }
  return { rows: rows(), ambiguousDates };
}

export interface Draft {
  id: number;
  source: 'oct' | 'csv';
  mapping: Mapping | null;
}

/** The preview of a draft (ADR-0026 §5): reads the file again, writes nothing. */
export async function previewDraft(
  draft: Draft,
  path: string,
  opts: {
    daysWithEntries: Set<string>;
    includeDaysWithEntries: boolean;
    locale: Locale;
  },
): Promise<Preview & { id: number }> {
  const { daysWithEntries, includeDaysWithEntries, locale } = opts;
  if (draft.source === 'oct') {
    const rows = octRows(await readOct(path));
    const summary = await summarize(
      rows,
      daysWithEntries,
      includeDaysWithEntries,
    );
    return { id: draft.id, ...summary, ambiguousDates: false };
  }
  const { rows, ambiguousDates } = await csvRecords(path, draft, locale);
  const summary = await summarize(
    rows,
    daysWithEntries,
    includeDaysWithEntries,
  );
  return { id: draft.id, ...summary, ambiguousDates };
}
