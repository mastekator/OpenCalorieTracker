/** Dishes count as "the same" when kcal per 100 g differ by at most 25 % of the larger value... */
export const SIMILAR_DENSITY_RATIO = 0.25;
/** ...or by at most 20 kcal/100 g, so low-calorie dishes (tea, broth) still match (ADR-0009). */
export const SIMILAR_DENSITY_ABS = 20;

/** Whether two kcal-per-100 g values are close enough to suggest the past dish (AC-11). */
export const isSimilarDensity = (a: number, b: number) =>
  Math.abs(a - b) <=
  Math.max(SIMILAR_DENSITY_RATIO * Math.max(a, b), SIMILAR_DENSITY_ABS);
