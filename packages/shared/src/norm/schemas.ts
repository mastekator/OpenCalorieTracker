import { z } from 'zod';
import { HEIGHT_CM, WEIGHT_KG } from '../units.js';
import { addDays, addYears, ageYears } from '../dates.js';

export const sexSchema = z.enum(['male', 'female']);
export type Sex = z.infer<typeof sexSchema>;

export const activitySchema = z.enum([
  'minimal',
  'light',
  'moderate',
  'high',
  'very_high',
]);
export type Activity = z.infer<typeof activitySchema>;

export const goalSchema = z.enum(['lose', 'maintain', 'gain']);
export type Goal = z.infer<typeof goalSchema>;

export const ACTIVITY_FACTORS: Record<Activity, number> = {
  minimal: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.9,
};

export const KCAL_FLOOR: Record<Sex, number> = { male: 1500, female: 1200 };

export const DEFAULT_MANUAL_PCT = { protein: 20, fat: 30, carbs: 50 } as const;

const weightKg = z.number().min(WEIGHT_KG.min).max(WEIGHT_KG.max);

/**
 * Profile in cm and kg; every field may be empty (partial profile, AC-1.3).
 * Rules that depend on today or on what changed are separate functions below.
 */
export const profileSchema = z
  .object({
    sex: sexSchema.nullable(),
    birthDate: z.iso.date().nullable(),
    heightCm: z.number().min(HEIGHT_CM.min).max(HEIGHT_CM.max).nullable(),
    weightKg: weightKg.nullable(),
    activity: activitySchema.nullable(),
    goal: goalSchema.nullable(),
    targetWeightKg: weightKg.nullable(),
    deadline: z.iso.date().nullable(),
  })
  .refine(
    (p) => p.targetWeightKg === null || p.goal === 'lose' || p.goal === 'gain',
    { path: ['targetWeightKg'], message: 'target_requires_lose_or_gain' },
  )
  .refine((p) => p.deadline === null || p.targetWeightKg !== null, {
    path: ['deadline'],
    message: 'deadline_requires_target',
  });
export type Profile = z.infer<typeof profileSchema>;

export const manualNormSchema = z
  .object({
    kcal: z.number().int().min(800).max(6000),
    proteinPct: z.number().int().min(0).max(100),
    fatPct: z.number().int().min(0).max(100),
    carbsPct: z.number().int().min(0).max(100),
  })
  .refine((m) => m.proteinPct + m.fatPct + m.carbsPct === 100, {
    message: 'pct_sum_not_100',
  });
export type ManualNorm = z.infer<typeof manualNormSchema>;

/** Deadline must be 2 weeks – 2 years from today; the server checks it only when it changed (E-1.8). */
export const deadlineError = (deadline: string, today: string) => {
  if (deadline < addDays(today, 14)) return 'deadline_too_soon';
  if (deadline > addYears(today, 2)) return 'deadline_too_far';
  return null;
};

/** Under 18 is not an error: it yields `minor` (AC-4.1). */
export const birthDateError = (birthDate: string, today: string) => {
  if (birthDate > today) return 'birth_date_in_future';
  if (ageYears(birthDate, today) > 100) return 'age_over_100';
  return null;
};

/**
 * Target below current weight to lose, above to gain. Checked only when goal or
 * target changed, so saving a new weight after reaching the goal works (E-1.7).
 */
export const targetWeightError = (p: Profile) => {
  if (p.targetWeightKg === null || p.weightKg === null) return null;
  if (p.goal === 'lose' && p.targetWeightKg >= p.weightKg)
    return 'target_not_below_weight';
  if (p.goal === 'gain' && p.targetWeightKg <= p.weightKg)
    return 'target_not_above_weight';
  return null;
};

/** `PUT /api/profile` body: full replacement of the profile and the manual norm. */
export const profileRequestSchema = z.object({
  profile: profileSchema,
  manual: manualNormSchema.nullable(),
});
export type ProfileRequest = z.infer<typeof profileRequestSchema>;

export interface ProfileResponse extends ProfileRequest {
  rev: number;
}
