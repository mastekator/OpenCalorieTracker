import { z } from 'zod';
import { mealTypeSchema } from '../meals.js';

const column = z.number().int().min(0);
/** Column indexes of the file; date, name and kcal are required (design: no kcal, no record). */
export const mappingSchema = z.object({
  columns: z.object({
    date: column,
    time: column.optional(),
    meal: column.optional(),
    name: column,
    grams: column.optional(),
    kcal: column,
    protein: column.optional(),
    fat: column.optional(),
    carbs: column.optional(),
  }),
  /** Unset: guessed from the file, `ambiguousDates` when it cannot be. */
  dateOrder: z.enum(['dmy', 'mdy', 'ymd']).optional(),
  /** Unset: a comma is decimal when the number has no dot. */
  decimal: z.enum(['.', ',']).optional(),
});
export type Mapping = z.infer<typeof mappingSchema>;
export type DateOrder = NonNullable<Mapping['dateOrder']>;
export type Columns = Mapping['columns'];

/** One dish of the preview and of the commit. */
export const importRecordSchema = z.object({
  localDate: z.string(),
  /** `HH:MM`, null when the file has none. */
  time: z.string().nullable(),
  mealType: mealTypeSchema,
  name: z.string(),
  grams: z.number(),
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
});
export type ImportRecord = z.infer<typeof importRecordSchema>;

export const rowReasonSchema = z.enum([
  'no_date',
  'bad_date',
  'no_name',
  'no_kcal',
  'kcal_out_of_range',
]);
export type RowReason = z.infer<typeof rowReasonSchema>;

/** The draft's preview (ADR-0026 §5). */
export const previewSchema = z.object({
  period: z.object({ from: z.string(), to: z.string() }).nullable(),
  days: z.number(),
  records: z.number(),
  skippedDays: z.number(),
  skippedRecords: z.number(),
  first: z.array(importRecordSchema),
  unrecognized: z.object({
    count: z.number(),
    rows: z.array(z.object({ line: z.number(), reason: rowReasonSchema })),
  }),
  ambiguousDates: z.boolean(),
});
export type Preview = z.infer<typeof previewSchema>;
