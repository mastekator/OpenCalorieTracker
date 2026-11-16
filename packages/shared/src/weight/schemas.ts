import { z } from 'zod';
import { WEIGHT_KG } from '../units.js';
import type { ProfileResponse } from '../norm/schemas.js';

/** Body weight in kg; the same bounds for the profile and the weight diary. */
export const weightKgSchema = z.number().min(WEIGHT_KG.min).max(WEIGHT_KG.max);

/** One weighing per day: the date is its key (ADR-0016 §1). */
export const weighingSchema = z.object({
  date: z.iso.date(),
  weightKg: weightKgSchema,
});
export type Weighing = z.infer<typeof weighingSchema>;

/** `PUT /api/weighings/:date` body. */
export const weighingRequestSchema = weighingSchema.pick({ weightKg: true });
export type WeighingRequest = z.infer<typeof weighingRequestSchema>;

/** The profile comes back too: its weight follows the latest weighing (ADR-0016 §2). */
export interface WeighingPutResponse {
  weighing: Weighing;
  profile: ProfileResponse;
}

/** `DELETE /api/weighings/:date`, idempotent. */
export interface WeighingDeleteResponse {
  profile: ProfileResponse;
}

/** Not in the future, not before birth (AC-9.3). The server passes its today + 1 day for device time zones. */
export const weighingDateError = (
  date: string,
  today: string,
  birthDate: string | null,
) => {
  if (date > today) return 'weighing_date_in_future';
  if (birthDate !== null && date < birthDate)
    return 'weighing_date_before_birth';
  return null;
};
