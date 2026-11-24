import { z } from 'zod';
import { mappingSchema, previewSchema, type Mapping } from '@oct/shared';
import { api } from './client';

export type ImportSource = 'oct' | 'csv' | 'mfp' | 'cronometer';

const draftPreviewSchema = previewSchema.extend({ id: z.number() });
export type DraftPreview = z.infer<typeof draftPreviewSchema>;

const needsMappingSchema = z.object({
  id: z.number(),
  needsMapping: z.literal(true),
  headers: z.array(z.string()),
  columns: mappingSchema.shape.columns.partial(),
  sample: z.array(z.array(z.string())),
});
export type NeedsMapping = z.infer<typeof needsMappingSchema>;

const include = (all: boolean) => (all ? '?includeDaysWithEntries=1' : '');

/** The raw file goes as the body (ADR-0026 §5); an «Other CSV» answers with its headers first. */
export const uploadImport = (source: ImportSource, file: Blob) =>
  api(
    `/api/imports?source=${source}`,
    z.union([needsMappingSchema, draftPreviewSchema]),
    { method: 'POST', body: file },
  );

export const putMapping = (id: number, mapping: Mapping, all: boolean) =>
  api(`/api/imports/${id}/mapping${include(all)}`, draftPreviewSchema, {
    method: 'PUT',
    body: mapping,
  });

export const getPreview = (id: number, all: boolean) =>
  api(`/api/imports/${id}/preview${include(all)}`, draftPreviewSchema);

/** `tzOffsetMin` east-positive, as a meal sends it: CSV times are the browser's local time. */
export const commitImport = (id: number, includeDaysWithEntries: boolean) =>
  api(`/api/imports/${id}/commit`, z.object({ records: z.number() }), {
    method: 'POST',
    body: {
      includeDaysWithEntries,
      tzOffsetMin: -new Date().getTimezoneOffset(),
    },
  });

const pastImportSchema = z.object({
  id: z.number(),
  source: z.enum(['oct', 'csv', 'mfp', 'cronometer']),
  committedAt: z.number(),
  records: z.number(),
});
export type PastImport = z.infer<typeof pastImportSchema>;

/** Committed imports, newest first (ADR-0026 §7). */
export const listImports = () => api('/api/imports', z.array(pastImportSchema));

/** What «Delete import» takes away: entries, days, and meals edited since. */
const deleteInfoSchema = z.object({
  records: z.number(),
  edited: z.number(),
  days: z.number(),
});
export type DeleteInfo = z.infer<typeof deleteInfoSchema>;

export const deleteInfo = (id: number) =>
  api(`/api/imports/${id}/delete-info`, deleteInfoSchema);

export const deleteImport = (id: number) =>
  api(`/api/imports/${id}`, z.undefined(), { method: 'DELETE' });
