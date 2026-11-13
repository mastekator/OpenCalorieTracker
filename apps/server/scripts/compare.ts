import { confidenceLevel, type Recognition } from '@oct/shared';

export type Expected =
  | {
      file: string;
      dishes: string[];
      kcal: [number, number];
      level: 'exact' | 'notExact';
    }
  | { file: string; empty: true };

/** Why the recognition misses the expectation, or null when it matches (ADR-0007 test set). */
export function compare(expected: Expected, got: Recognition): string | null {
  if ('empty' in expected)
    return got.dishes.length === 0 ? null : 'expected no dishes';
  if (got.dishes.length === 0) return 'no dishes';
  const kcal = totalKcal(got);
  const [min, max] = expected.kcal;
  if (kcal < min || kcal > max) return `kcal ${kcal} not in ${min}-${max}`;
  const exact = got.dishes.map(
    (d) => confidenceLevel(d.confidence) === 'exact',
  );
  if (expected.level === 'exact' && !exact.every(Boolean))
    return 'not every dish is exact';
  if (expected.level === 'notExact' && exact.some(Boolean))
    return 'a mixed dish is exact';
  return null;
}

export const totalKcal = (r: Recognition) =>
  Math.round(r.dishes.reduce((sum, d) => sum + d.kcal, 0));
