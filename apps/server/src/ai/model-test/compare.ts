import { readFile } from 'node:fs/promises';
import { confidenceLevel, type Recognition } from '@oct/shared';

/** apps/server/test-photos: same depth from src/ and dist/, copied into the image (ADR-0019). */
export const TEST_PHOTOS_DIR = new URL(
  '../../../test-photos/',
  import.meta.url,
);

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

export async function readExpected(): Promise<Expected[]> {
  return JSON.parse(
    await readFile(new URL('expected.json', TEST_PHOTOS_DIR), 'utf8'),
  ) as Expected[];
}

/** What the photo expects, for the report: `egg, egg; 150-300 kcal; exact`. */
export const expectedText = (e: Expected) =>
  'empty' in e
    ? '(none)'
    : `${e.dishes.join(', ')}; ${e.kcal.join('-')} kcal; ${e.level}`;

/** One photo's columns of a model test, from a recognition. */
export function checkPhoto(expected: Expected, got: Recognition) {
  return {
    got: got.dishes.map((d) => d.name).join(', ') || '(none)',
    kcal: totalKcal(got),
    levels: got.dishes.map((d) => confidenceLevel(d.confidence)).join(','),
    result: compare(expected, got) ?? 'ok',
  };
}
