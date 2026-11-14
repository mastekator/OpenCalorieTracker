import { z } from 'zod';
import { LOCALES } from './locales.js';
import { unitsSchema } from './units.js';

export const localeSchema = z.enum(LOCALES);
export const themeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof themeSchema>;

/** Days a full photo is kept (ADR-0008): 0 keeps only the preview, null keeps it forever. */
export const photoRetentionDaysSchema = z.union([
  z.literal(0),
  z.literal(7),
  z.literal(30),
  z.literal(90),
  z.null(),
]);
export type PhotoRetentionDays = z.infer<typeof photoRetentionDaysSchema>;

export const photoRetentionSchema = z.object({
  days: photoRetentionDaysSchema,
});
export type PhotoRetention = z.infer<typeof photoRetentionSchema>;

/** `days` of GET /account/photo-retention/impact; empty string = forever. */
export const photoRetentionImpactQuerySchema = z.object({
  days: z
    .enum(['0', '7', '30', '90', ''])
    .transform((d) => (d === '' ? null : Number(d))),
});
export const photoRetentionImpactSchema = z.object({
  /** Full photos the change would delete now. */
  willDelete: z.number().int(),
});
export type PhotoRetentionImpact = z.infer<typeof photoRetentionImpactSchema>;

export const accountSettingsSchema = z.object({
  locale: localeSchema,
  theme: themeSchema,
  units: unitsSchema,
  /** Sync revision of the last applied change (ADR-0011 §3). */
  settingsRev: z.number().int(),
  /** Read-only here; changed through PUT /account/photo-retention. */
  photoRetentionDays: photoRetentionDaysSchema,
  /** The norm disclaimer was dismissed; it never comes back (design 8.21). */
  normDisclaimerHidden: z.boolean(),
});
export type AccountSettings = z.infer<typeof accountSettingsSchema>;

/** Last edit wins: a change with an older `editedAt` (Unix ms) than the stored one is ignored. */
export const accountSettingsPatchSchema = z.object({
  locale: localeSchema.optional(),
  theme: themeSchema.optional(),
  units: unitsSchema.optional(),
  /** Only `true`: a hidden disclaimer cannot be shown again. Not subject to `editedAt`. */
  normDisclaimerHidden: z.literal(true).optional(),
  editedAt: z.number().int().nonnegative().optional(),
});
export type AccountSettingsPatch = z.infer<typeof accountSettingsPatchSchema>;
