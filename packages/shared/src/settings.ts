import { z } from 'zod';
import { LOCALES } from './locales.js';
import { unitsSchema } from './units.js';

export const localeSchema = z.enum(LOCALES);
export const themeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof themeSchema>;

export const accountSettingsSchema = z.object({
  locale: localeSchema,
  theme: themeSchema,
  units: unitsSchema,
  /** Sync revision of the last applied change (ADR-0011 §3). */
  settingsRev: z.number().int(),
});
export type AccountSettings = z.infer<typeof accountSettingsSchema>;

/** Last edit wins: a change with an older `editedAt` (Unix ms) than the stored one is ignored. */
export const accountSettingsPatchSchema = z.object({
  locale: localeSchema.optional(),
  theme: themeSchema.optional(),
  units: unitsSchema.optional(),
  editedAt: z.number().int().nonnegative().optional(),
});
export type AccountSettingsPatch = z.infer<typeof accountSettingsPatchSchema>;
