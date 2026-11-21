import { describe, expect, it } from 'vitest';
import {
  guessColumns,
  guessDateOrder,
  mappingSchema,
  mealTypeOf,
  parseDate,
  parseNumber,
  parseTime,
  summarize,
  toRecord,
  type ImportRecord,
  type RowContext,
  type RowReason,
} from './rules.js';

const HEADERS = [
  'date',
  'time',
  'meal',
  'name',
  'grams',
  'kcal',
  'protein_g',
  'fat_g',
  'carbs_g',
];
const ctx: RowContext = {
  columns: {
    date: 0,
    time: 1,
    meal: 2,
    name: 3,
    grams: 4,
    kcal: 5,
    protein: 6,
    fat: 7,
    carbs: 8,
  },
  headers: HEADERS,
  dateOrder: 'ymd',
  locale: 'en',
};
const record = (row: string[], over: Partial<RowContext> = {}) =>
  toRecord(row, { ...ctx, ...over });

describe('import rules (ADR-0026 §5)', () => {
  it('reads a dish row', () => {
    expect(
      record([
        '2024-03-04',
        '08:30',
        'Breakfast',
        'Oatmeal',
        '200',
        '150',
        '5',
        '3',
        '27',
      ]),
    ).toEqual({
      localDate: '2024-03-04',
      time: '08:30',
      mealType: 'breakfast',
      name: 'Oatmeal',
      grams: 200,
      kcal: 150,
      proteinG: 5,
      fatG: 3,
      carbsG: 27,
    });
  });

  it('maps meal words in RU and EN', () => {
    expect(mealTypeOf('завтрак', null)).toBe('breakfast');
    expect(mealTypeOf('Обед', null)).toBe('lunch');
    expect(mealTypeOf('Supper', null)).toBe('dinner');
    expect(mealTypeOf('Snacks', null)).toBe('snack');
    expect(mealTypeOf('перекус', null)).toBe('snack');
  });

  it('takes the meal by time when the word is missing, else snack', () => {
    expect(mealTypeOf('', '08:00')).toBe('breakfast');
    expect(mealTypeOf('brunch?', '19:00')).toBe('dinner');
    expect(mealTypeOf('', null)).toBe('snack');
  });

  it('names a meal-only row "<meal> total" in the user language (AC-2.3)', () => {
    const row = ['2024-03-04', '', 'Lunch', '', '', '700', '', '', ''];
    expect(record(row)).toMatchObject({
      name: 'Lunch total',
      grams: 0,
      kcal: 700,
    });
    expect(record(row, { locale: 'ru' })).toMatchObject({
      name: 'Итог за обед',
    });
    expect(record(['2024-03-04', '', '', '', '', '700'])).toBe('no_name');
  });

  it('converts kJ to kcal and ounces to grams by the header (AC-2.8)', () => {
    const headers = HEADERS.with(4, 'Amount (oz)').with(5, 'Energy (kJ)');
    const r = record(['2024-03-04', '', '', 'Tea', '2', '418.4'], {
      headers,
    }) as ImportRecord;
    expect(r.kcal).toBeCloseTo(100);
    expect(r.grams).toBeCloseTo(56.699);
  });

  it('reads the date in the given order and refuses impossible ones', () => {
    expect(parseDate('03/04/2024', 'dmy')).toBe('2024-04-03');
    expect(parseDate('03/04/2024', 'mdy')).toBe('2024-03-04');
    expect(parseDate('2024.03.04', 'dmy')).toBe('2024-03-04');
    expect(parseDate('4.3.24', 'dmy')).toBe('2024-03-04');
    expect(parseDate('31/02/2024', 'dmy')).toBeNull();
    expect(parseDate('yesterday', 'dmy')).toBeNull();
  });

  it('guesses the date order and flags it when every day is ≤ 12 (E-2)', async () => {
    expect(await guessDateOrder(['2024-03-04'])).toEqual({
      order: 'ymd',
      ambiguous: false,
    });
    expect(await guessDateOrder(['03/04/2024', '25/04/2024'])).toEqual({
      order: 'dmy',
      ambiguous: false,
    });
    expect(await guessDateOrder(['03/04/2024', '04/25/2024'])).toEqual({
      order: 'mdy',
      ambiguous: false,
    });
    expect(await guessDateOrder(['03/04/2024', '05/06/2024'])).toEqual({
      order: 'dmy',
      ambiguous: true,
    });
  });

  it('reads the time from its column or after the date', () => {
    expect(parseTime('8:30 PM')).toBe('20:30');
    expect(parseTime('12:05 am')).toBe('00:05');
    expect(parseTime('07:15:00')).toBe('07:15');
    expect(parseTime('25:00')).toBeNull();
    expect(
      record(['2024-03-04 19:10', '', '', 'Soup', '', '90']),
    ).toMatchObject({
      time: '19:10',
      mealType: 'dinner',
    });
  });

  it('reads decimal commas and thousands', () => {
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('1 234,5', ',')).toBe(1234.5);
    expect(parseNumber('1.234,5', ',')).toBe(1234.5);
    expect(parseNumber('1,234.5', '.')).toBe(1234.5);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });

  it('puts rows without date, name or kcal, or kcal outside 0–10 000, into unrecognized', () => {
    const row = (date: string, name: string, kcal: string) => [
      date,
      '',
      '',
      name,
      '',
      kcal,
    ];
    expect(record(row('', 'Tea', '5'))).toBe<RowReason>('no_date');
    expect(record(row('soon', 'Tea', '5'))).toBe<RowReason>('bad_date');
    expect(record(row('2024-03-04', 'Tea', ''))).toBe<RowReason>('no_kcal');
    expect(record(row('2024-03-04', 'Tea', '-1'))).toBe<RowReason>(
      'kcal_out_of_range',
    );
    expect(record(row('2024-03-04', 'Tea', '10001'))).toBe<RowReason>(
      'kcal_out_of_range',
    );
    expect(record(row('2024-03-04', 'Tea', '10000'))).toMatchObject({
      kcal: 10000,
    });
  });

  it('requires date, name and kcal columns in the mapping', () => {
    expect(
      mappingSchema.safeParse({ columns: { date: 0, name: 1 } }).success,
    ).toBe(false);
    expect(
      mappingSchema.safeParse({ columns: { date: 0, name: 1, kcal: 2 } })
        .success,
    ).toBe(true);
  });

  it('guesses columns from RU and EN headers', () => {
    expect(guessColumns(HEADERS)).toEqual(ctx.columns);
    expect(guessColumns(['Дата', 'Блюдо', 'Ккал', 'Белки'])).toEqual({
      date: 0,
      name: 1,
      kcal: 2,
      protein: 3,
    });
  });

  it('skips days that already have meals unless asked to include them (AC-2.5)', async () => {
    const dish = (localDate: string) =>
      ({
        localDate,
        time: null,
        mealType: 'snack',
        name: 'x',
        grams: 0,
        kcal: 1,
        proteinG: 0,
        fatG: 0,
        carbsG: 0,
      }) as ImportRecord;
    const rows = () =>
      (async function* () {
        yield { line: 2, record: dish('2024-03-01') };
        yield { line: 3, record: dish('2024-03-02') };
        yield { line: 4, record: dish('2024-03-02') };
        yield { line: 5, record: 'no_kcal' as const };
      })();
    const existing = new Set(['2024-03-02']);
    expect(await summarize(rows(), existing, false)).toMatchObject({
      period: { from: '2024-03-01', to: '2024-03-02' },
      days: 1,
      records: 1,
      skippedDays: 1,
      skippedRecords: 2,
      unrecognized: { count: 1, rows: [{ line: 5, reason: 'no_kcal' }] },
    });
    expect(await summarize(rows(), existing, true)).toMatchObject({
      days: 2,
      records: 3,
      skippedDays: 0,
      skippedRecords: 0,
    });
  });

  it('keeps the first 10 dishes and the first 50 unrecognized rows', async () => {
    const rows = (async function* () {
      for (let line = 2; line < 202; line++)
        yield {
          line,
          record:
            line % 2
              ? ('no_name' as const)
              : ({
                  localDate: '2024-01-01',
                  time: null,
                  mealType: 'snack',
                  name: 'x',
                  grams: 0,
                  kcal: 1,
                  proteinG: 0,
                  fatG: 0,
                  carbsG: 0,
                } as ImportRecord),
        };
    })();
    const p = await summarize(rows, new Set(), false);
    expect(p.first).toHaveLength(10);
    expect(p.unrecognized.count).toBe(100);
    expect(p.unrecognized.rows).toHaveLength(50);
  });
});
