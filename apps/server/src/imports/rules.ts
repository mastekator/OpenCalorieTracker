import {
  mealTypeAt,
  type Columns,
  type DateOrder,
  type ImportRecord,
  type Locale,
  type Mapping,
  type MealType,
  type Preview,
  type RowReason,
} from '@oct/shared';

export {
  mappingSchema,
  type Columns,
  type DateOrder,
  type ImportRecord,
  type Mapping,
  type Preview,
  type RowReason,
} from '@oct/shared';

/** Rows past this answer 413 import_too_large (≈ 50 MB of CSV, ADR-0026 §5). */
export const MAX_IMPORT_ROWS = 200_000;
export const MAX_IMPORT_KCAL = 10_000;
const KJ_PER_KCAL = 4.184;
const GRAMS_PER_OZ = 28.3495;

// Header words for guessing columns: our export headers plus common RU/EN ones.
const HEADERS: [keyof Columns, RegExp][] = [
  ['date', /^(date|day|дата|день)(?!\p{L})/iu],
  ['time', /^(time|время)(?!\p{L})/iu],
  ['meal', /^(meal|meal type|приём|прием|приём пищи|прием пищи)(?!\p{L})/iu],
  [
    'name',
    /^(name|food|dish|item|description|название|блюдо|продукт)(?!\p{L})/iu,
  ],
  [
    'grams',
    /^(grams|weight|amount|quantity|вес|граммы|масса|количество)(?!\p{L})/iu,
  ],
  ['kcal', /^(kcal|calories|energy|energ|ккал|калории|энерг)/i],
  ['protein', /^(protein|белк|белок)/i],
  ['fat', /^(fat|жир)/i],
  ['carbs', /^(carb|углевод)/i],
];

/** The first header matching each field; unmatched fields stay unset. */
export function guessColumns(headers: string[]): Partial<Columns> {
  const guess: Partial<Columns> = {};
  for (const [key, re] of HEADERS) {
    const i = headers.findIndex((h) => re.test(h.trim()));
    if (i >= 0) guess[key] = i;
  }
  return guess;
}

export type TrackerSource = 'mfp' | 'cronometer';

/**
 * The fixed mapping of a tracker's export (ADR-0026 §6), found by header names, not positions;
 * null when the file lacks a required column. MFP «Nutrition Summary» rows are meal totals
 * (Date, Meal, Calories…); Cronometer servings name the food and its «Group».
 */
export function trackerMapping(
  source: TrackerSource,
  headers: string[],
): SourceMapping | null {
  const columns: Partial<Columns> = guessColumns(headers);
  if (source === 'mfp') delete columns.name;
  else {
    const group = headers.findIndex((h) => /^group$/i.test(h.trim()));
    if (group >= 0) columns.meal = group;
  }
  const { date, kcal, meal } = columns;
  if (date === undefined || kcal === undefined) return null;
  if (source === 'mfp' ? meal === undefined : columns.name === undefined)
    return null;
  return { columns: { ...columns, date, kcal } };
}

/** kJ and ounces are read from the column header (AC-2.8). */
export const isKj = (header: string) => /kj|кдж|kilojoule/i.test(header);
export const isOz = (header: string) => /\boz\b|ounce|унц/i.test(header);
export const kjToKcal = (kj: number) => kj / KJ_PER_KCAL;
export const ozToGrams = (oz: number) => oz * GRAMS_PER_OZ;

/** A number with `.` or `,` decimals and spaces between thousands; null when not a number. */
export function parseNumber(text: string, decimal?: '.' | ',') {
  let s = text.trim().replace(/\s/g, '');
  if (!s) return null;
  if (decimal === ',') s = s.replaceAll('.', '').replace(',', '.');
  else if (decimal === '.') s = s.replaceAll(',', '');
  else if (!s.includes('.')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** The three numbers of a date and the time after it (`2024-03-04 08:30`, `04.03.2024`). */
function dateParts(text: string) {
  const m = /^(\d{1,4})[-./](\d{1,2})[-./](\d{1,4})(?:[ T]+(.+))?$/.exec(
    text.trim(),
  );
  return m ? { parts: [+m[1]!, +m[2]!, +m[3]!], rest: m[4] ?? '' } : null;
}

/**
 * The order the file's dates allow (E-2): a year first is `ymd`, a first part over 12 is `dmy`,
 * a second one is `mdy`. `ambiguous` when every day is ≤ 12; `dmy` is then the guess.
 */
export async function guessDateOrder(
  dates: Iterable<string> | AsyncIterable<string>,
) {
  let dmy = false;
  let mdy = false;
  let ymd = false;
  for await (const d of dates) {
    const p = dateParts(d)?.parts;
    if (!p) continue;
    if (p[0]! > 31) ymd = true;
    else if (p[0]! > 12) dmy = true;
    else if (p[1]! > 12) mdy = true;
  }
  if (ymd) return { order: 'ymd' as const, ambiguous: false };
  if (dmy !== mdy)
    return {
      order: dmy ? ('dmy' as const) : ('mdy' as const),
      ambiguous: false,
    };
  return { order: 'dmy' as const, ambiguous: !dmy };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in the given order, or null for an impossible date. Two-digit years are 20xx. */
export function parseDate(text: string, order: DateOrder) {
  const p = dateParts(text)?.parts;
  if (!p) return null;
  // A four-digit year first wins over the order: `2024-03-04` in a dmy file.
  const [y, m, d] =
    order === 'ymd' || p[0]! > 31
      ? p
      : order === 'dmy'
        ? [p[2]!, p[1]!, p[0]!]
        : [p[2]!, p[0]!, p[1]!];
  const year = y! < 100 ? 2000 + y! : y!;
  const date = new Date(Date.UTC(year, m! - 1, d!));
  if (date.getUTCMonth() !== m! - 1 || date.getUTCDate() !== d!) return null;
  return `${year}-${pad(m!)}-${pad(d!)}`;
}

/** `HH:MM` from `8:30`, `08:30:00`, `8:30 PM`; null when it is not a time. */
export function parseTime(text: string) {
  const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i.exec(
    text.trim(),
  );
  if (!m) return null;
  let h = +m[1]!;
  const min = +m[2]!;
  const pm = m[3]?.[0]?.toLowerCase();
  if (pm) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (pm === 'p' ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

const MEAL_WORDS: [MealType, RegExp][] = [
  ['breakfast', /^(breakfast|завтрак)/i],
  ['lunch', /^(lunch|обед)/i],
  ['dinner', /^(dinner|supper|ужин)/i],
  ['snack', /^(snacks?|перекус)/i],
];

/** The meal type named in the file (RU/EN), null when the word is unknown. */
export function mealTypeFromWord(text: string): MealType | null {
  const word = text.trim();
  return MEAL_WORDS.find(([, re]) => re.test(word))?.[0] ?? null;
}

/** The named meal, else by time like a manual record (AC-3.10), else snack. */
export function mealTypeOf(word: string, time: string | null): MealType {
  return (
    mealTypeFromWord(word) ?? (time ? mealTypeAt(+time.slice(0, 2)) : 'snack')
  );
}

const TOTAL_NAMES: Record<Locale, Record<MealType, string>> = {
  en: {
    breakfast: 'Breakfast total',
    lunch: 'Lunch total',
    dinner: 'Dinner total',
    snack: 'Snack total',
  },
  ru: {
    breakfast: 'Итог за завтрак',
    lunch: 'Итог за обед',
    dinner: 'Итог за ужин',
    snack: 'Итог за перекус',
  },
};
/** The dish of a source row that has a meal but no dish name (AC-2.3). */
export const totalName = (mealType: MealType, locale: Locale) =>
  TOTAL_NAMES[locale][mealType];

/** A tracker's fixed mapping may have no name column (an MFP summary): rows are meal totals. */
export type SourceMapping = Omit<Mapping, 'columns'> & {
  columns: Omit<Columns, 'name'> & { name?: number };
};

/** Grams from `150`, `150 g` or `5 oz`; ounces also by the header (AC-2.8). */
function gramsOf(text: string, header: string, decimal?: '.' | ',') {
  const m = /^(\d[\d\s.,]*?)\s*(\p{L}*)\.?$/u.exec(text);
  if (!m) return 0;
  const n = parseNumber(m[1]!, decimal) ?? 0;
  const unit = m[2]!.toLowerCase();
  if (unit === 'oz' || (!unit && isOz(header))) return ozToGrams(n);
  if (!unit || /^(g|gr|grams?|г|гр)$/.test(unit)) return n;
  // shortcut: servings not in grams (cup, pcs) import as 0 g with their kcal and macros; upgrade with per-food serving weights.
  return 0;
}

export interface RowContext {
  columns: SourceMapping['columns'];
  headers: string[];
  dateOrder: DateOrder;
  decimal?: '.' | ',';
  locale: Locale;
}

/** One CSV row → a dish, or the reason it is unrecognized; never throws. */
export function toRecord(
  row: string[],
  { columns, headers, dateOrder, decimal, locale }: RowContext,
): ImportRecord | RowReason {
  const cell = (i: number | undefined) =>
    i === undefined ? '' : (row[i] ?? '').trim();
  const num = (i: number | undefined) =>
    i === undefined ? null : parseNumber(cell(i), decimal);

  const dateText = cell(columns.date);
  if (!dateText) return 'no_date';
  const localDate = parseDate(dateText, dateOrder);
  if (!localDate) return 'bad_date';
  const time =
    parseTime(cell(columns.time)) ?? parseTime(dateParts(dateText)!.rest);

  const mealWord = cell(columns.meal);
  const mealType = mealTypeOf(mealWord, time);
  let name = cell(columns.name);
  if (!name) {
    // Without a name column every row is its meal's total, whatever the meal is called.
    if (columns.name !== undefined && !mealTypeFromWord(mealWord))
      return 'no_name';
    name = totalName(mealType, locale);
  }

  let kcal = num(columns.kcal);
  if (kcal === null) return 'no_kcal';
  if (isKj(headers[columns.kcal] ?? '')) kcal = kjToKcal(kcal);
  if (kcal < 0 || kcal > MAX_IMPORT_KCAL) return 'kcal_out_of_range';

  const grams =
    columns.grams === undefined
      ? 0
      : gramsOf(cell(columns.grams), headers[columns.grams] ?? '', decimal);
  // Bad macros or grams do not drop a dish that has its kcal: they read as 0.
  const nonNeg = (n: number | null) => (n !== null && n > 0 ? n : 0);
  return {
    localDate,
    time,
    mealType,
    name,
    grams: nonNeg(grams),
    kcal,
    proteinG: nonNeg(num(columns.protein)),
    fatG: nonNeg(num(columns.fat)),
    carbsG: nonNeg(num(columns.carbs)),
  };
}

/**
 * Folds rows into the preview. Days that already have meals are skipped unless
 * `includeDaysWithEntries` (AC-2.5); the period spans every recognized dish.
 */
export async function summarize(
  rows: AsyncIterable<{ line: number; record: ImportRecord | RowReason }>,
  daysWithEntries: Set<string>,
  includeDaysWithEntries: boolean,
): Promise<Omit<Preview, 'ambiguousDates'>> {
  const days = new Set<string>();
  const skippedDays = new Set<string>();
  let records = 0;
  let skippedRecords = 0;
  let from: string | null = null;
  let to: string | null = null;
  const first: ImportRecord[] = [];
  const unrecognized: Preview['unrecognized'] = { count: 0, rows: [] };
  for await (const { line, record } of rows) {
    if (typeof record === 'string') {
      unrecognized.count++;
      if (unrecognized.rows.length < 50)
        unrecognized.rows.push({ line, reason: record });
      continue;
    }
    const day = record.localDate;
    if (!from || day < from) from = day;
    if (!to || day > to) to = day;
    if (!includeDaysWithEntries && daysWithEntries.has(day)) {
      skippedDays.add(day);
      skippedRecords++;
      continue;
    }
    days.add(day);
    records++;
    if (first.length < 10) first.push(record);
  }
  return {
    period: from && to ? { from, to } : null,
    days: days.size,
    records,
    skippedDays: skippedDays.size,
    skippedRecords,
    first,
    unrecognized,
  };
}
