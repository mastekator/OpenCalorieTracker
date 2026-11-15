import type { MealType } from './meals.js';

/** Dishes count as "the same" when kcal per 100 g differ by at most 25 % of the larger value... */
export const SIMILAR_DENSITY_RATIO = 0.25;
/** ...or by at most 20 kcal/100 g, so low-calorie dishes (tea, broth) still match (ADR-0009). */
export const SIMILAR_DENSITY_ABS = 20;

/** Whether two kcal-per-100 g values are close enough to suggest the past dish (AC-11). */
export const isSimilarDensity = (a: number, b: number) =>
  Math.abs(a - b) <=
  Math.max(SIMILAR_DENSITY_RATIO * Math.max(a, b), SIMILAR_DENSITY_ABS);

export interface Nutrients {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

const scale = (n: Nutrients, k: (v: number) => number): Nutrients => ({
  kcal: k(n.kcal),
  proteinG: k(n.proteinG),
  fatG: k(n.fatG),
  carbsG: k(n.carbsG),
});

/**
 * Dish at a new weight, always from its original values (AC-3.2), so repeated
 * edits don't drift. Multiplying first keeps 150 → 1 → 150 g exact.
 */
export const scaleItem = <T extends Nutrients & { grams: number }>(
  original: T,
  grams: number,
): T => ({
  ...original,
  ...scale(original, (v) => (v * grams) / original.grams),
  grams,
});

/** Totals for `grams` of a dish entered "per 100 g" (AC-5.3). */
export const fromPer100 = (per100: Nutrients, grams: number): Nutrients =>
  scale(per100, (v) => (v * grams) / 100);

/** Atwater factors: 4 kcal/g protein and carbs, 9 kcal/g fat. */
export const kcalFromMacros = (
  proteinG: number,
  fatG: number,
  carbsG: number,
) => proteinG * 4 + fatG * 9 + carbsG * 4;

/** Share by which kcal and the macros disagree, 0..1; above 0.3 is a soft warning (AC-5.4). */
export function macrosMismatch(
  kcal: number,
  proteinG: number,
  fatG: number,
  carbsG: number,
) {
  const fromMacros = kcalFromMacros(proteinG, fatG, carbsG);
  const larger = Math.max(kcal, fromMacros);
  return larger === 0 ? 0 : Math.abs(kcal - fromMacros) / larger;
}

/** Default meal type by the local hour on the device (AC-3.10). */
export function mealTypeAt(localHour: number): MealType {
  if (localHour >= 5 && localHour < 11) return 'breakfast';
  if (localHour >= 11 && localHour < 16) return 'lunch';
  if (localHour >= 16 && localHour < 22) return 'dinner';
  return 'snack';
}
