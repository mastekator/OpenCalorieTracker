import { z } from 'zod';

/**
 * Unit conversion without drift (ADR-0014 §2): input is rounded in the user's
 * system, converted and stored unrounded in cm/kg; display converts back and
 * rounds the same way, so the user always sees what they typed.
 */
export const unitsSchema = z.enum(['metric', 'us']);
export type Units = z.infer<typeof unitsSchema>;

export const CM_PER_INCH = 2.54;
export const KG_PER_LB = 0.45359237;

const round1 = (x: number) => Math.round(x * 10) / 10;

export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;

export const ftInToCm = (ft: number, inches: number) =>
  (ft * 12 + inches) * CM_PER_INCH;

/** Rounded to whole inches, as shown to the user. */
export const cmToFtIn = (cm: number) => {
  const total = Math.round(cm / CM_PER_INCH);
  return { ft: Math.floor(total / 12), in: total % 12 };
};

/** User-entered weight (kg or lb, step 0.1) → kg to store, unrounded. */
export const weightToKg = (value: number, units: Units) =>
  units === 'us' ? lbToKg(round1(value)) : round1(value);

/** Stored kg → weight shown in the user's system, step 0.1. */
export const weightFromKg = (kg: number, units: Units) =>
  round1(units === 'us' ? kgToLb(kg) : kg);

export const HEIGHT_CM = { min: 100, max: 250 } as const;
export const WEIGHT_KG = { min: 30, max: 300 } as const;

/**
 * Allowed ranges in the user's system: height in cm or whole inches, weight
 * in kg or lb. US bounds are converted and rounded inward.
 */
export const unitRanges = (units: Units) =>
  units === 'metric'
    ? { height: { ...HEIGHT_CM }, weight: { ...WEIGHT_KG } }
    : {
        height: {
          min: Math.ceil(HEIGHT_CM.min / CM_PER_INCH),
          max: Math.floor(HEIGHT_CM.max / CM_PER_INCH),
        },
        weight: {
          min: Math.ceil(kgToLb(WEIGHT_KG.min) * 10) / 10,
          max: Math.floor(kgToLb(WEIGHT_KG.max) * 10) / 10,
        },
      };
