import { z } from 'zod';
import {
  dishSourceSchema,
  kcalSchema,
  macroSchema,
  mealTypeSchema,
} from '../meals.js';
import { illustrationIdSchema } from '../illustrations/dictionary.js';
import { manualNormSchema, profileSchema } from '../norm/schemas.js';
import { localeSchema, themeSchema } from '../settings.js';
import { unitSchema, unitsSchema } from '../units.js';
import { weighingSchema } from '../weight/schemas.js';

/**
 * Raised only on an incompatible change; new optional keys keep it (ADR-0026 §1).
 * Import accepts `version <= OCT_EXPORT_VERSION`.
 */
export const OCT_EXPORT_VERSION = 1;

// Objects are not strict: unknown keys (modules added later, newer files) are dropped, not rejected.

/** Numbers as stored: no rounding rule, and 0 g for a "meal total" dish (AC-2.3). */
export const octExportDishSchema = z.object({
  name: z.string().min(1),
  grams: z.number().min(0).max(5000),
  unit: unitSchema,
  kcal: kcalSchema,
  proteinG: macroSchema,
  fatG: macroSchema,
  carbsG: macroSchema,
  /** `import` for dishes that came from an earlier import. */
  source: z.enum([...dishSourceSchema.options, 'import']),
  illustration: illustrationIdSchema.optional(),
});
export type OctExportDish = z.infer<typeof octExportDishSchema>;

export const octExportMealSchema = z.object({
  /** Not a uuid: imported meals use `import:<importId>:<n>`. */
  clientId: z.string().min(1),
  localDate: z.iso.date(),
  eatenAt: z.iso.datetime({ offset: true }),
  tzOffsetMin: z.number().int().min(-840).max(840),
  mealType: mealTypeSchema,
  /** Path inside the ZIP, when photos were exported: the full JPEG, or the WebP preview once the full one expired. */
  photo: z
    .string()
    .regex(/^photos\/[\w-]+\.(jpg|webp)$/)
    .optional(),
  dishes: z.array(octExportDishSchema).min(1),
});
export type OctExportMeal = z.infer<typeof octExportMealSchema>;

export const octExportSchema = z.object({
  format: z.literal('oct-export'),
  version: z.number().int().min(1).max(OCT_EXPORT_VERSION),
  exportedAt: z.iso.datetime({ offset: true }),
  /** App version that wrote the file. */
  app: z.string(),
  /** Null when the whole diary was exported. */
  period: z.object({ from: z.iso.date(), to: z.iso.date() }).nullable(),
  /** No email, as in the API. */
  profile: profileSchema,
  /** The manual norm; a calculated one follows from the profile. */
  norm: manualNormSchema.nullable(),
  settings: z.object({
    locale: localeSchema,
    theme: themeSchema,
    units: unitsSchema,
    offEnabled: z.boolean(),
  }),
  meals: z.array(octExportMealSchema),
  weighings: z.array(weighingSchema),
});
export type OctExport = z.infer<typeof octExportSchema>;

/** `meals.csv`: one row per dish (ADR-0026 §2); stable English headers. */
export const MEALS_CSV_HEADER = [
  'date',
  'time',
  'meal',
  'name',
  'grams',
  'unit',
  'kcal',
  'protein_g',
  'fat_g',
  'carbs_g',
  'source',
  'photo',
] as const;

export const WEIGHINGS_CSV_HEADER = ['date', 'weight_kg'] as const;

export const exportFormatSchema = z.enum(['json', 'csv']);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

/** Query of GET /export and GET /export/summary (ADR-0026 §3): no period is the whole diary. */
export const exportQuerySchema = z
  .object({
    format: exportFormatSchema.default('json'),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    photos: z.enum(['0', '1']).default('0'),
  })
  .refine((q) => !q.from === !q.to && (!q.from || q.from <= q.to!), {
    path: ['to'],
  });
export type ExportQuery = z.infer<typeof exportQuerySchema>;

/** GET /export/summary: what the export will hold; `bytes` is its exact size. */
export const exportSummarySchema = z.object({
  days: z.number().int(),
  dishes: z.number().int(),
  photos: z.number().int(),
  bytes: z.number().int(),
});
export type ExportSummary = z.infer<typeof exportSummarySchema>;
