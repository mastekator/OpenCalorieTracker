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
export const G_PER_OZ = 28.349523125;

/** Rounds to 0.1, the step of every user-entered or shown decimal. */
export const round1 = (x: number) => Math.round(x * 10) / 10;

export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;

/** Dish weight: grams shown in ounces with one decimal (AC-3.15). */
export const gToOz = (g: number) => round1(g / G_PER_OZ);
/** Ounces typed by the user → grams to store, step 0.1 like `mealItemInputSchema`. */
export const ozToG = (oz: number) => round1(oz * G_PER_OZ);

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

/** Dish weight in grams (AC-3.4). */
export const DISH_GRAMS = { min: 1, max: 5000 } as const;

/**
 * Dish weight range and stepper step in the user's system: whole grams, or
 * ounces with one decimal (0.1–176.4 oz, AC-3.15). 176.4 oz is 5000.9 g, so
 * the caller caps converted grams at `DISH_GRAMS.max`.
 */
export const dishWeightRange = (units: Units) =>
  units === 'metric'
    ? { ...DISH_GRAMS, step: 10 }
    : { min: 0.1, max: gToOz(DISH_GRAMS.max), step: 0.5 };
