import type { Weighing } from './schemas.js';

/**
 * Signed difference from the weighing nearest by date when it is more than 5 % of it (AC-9.5);
 * otherwise null. Exactly 5 % is not a jump.
 */
export const jumpCheck = (weightKg: number, nearest: Weighing | null) => {
  if (!nearest) return null;
  const diff = weightKg - nearest.weightKg;
  return Math.abs(diff) * 20 > nearest.weightKg ? diff : null;
};

/**
 * The obvious fix for a misplaced decimal separator (design §2): for input out of `range`, the
 * same digits as a whole number or with one decimal. Returns the fix when exactly one of those
 * is in range, else null (input already in range, not a number, or ambiguous like '3,00').
 */
export const commaFix = (
  input: string,
  range: { min: number; max: number },
) => {
  const s = input.trim();
  if (!/^\d+([.,]\d*)?$/.test(s)) return null;
  const inRange = (x: number) => x >= range.min && x <= range.max;
  if (inRange(Number(s.replace(',', '.')))) return null;
  const digits = Number(s.replace(/[.,]/, ''));
  const fixes = [digits, digits / 10].filter(inRange);
  return fixes.length === 1 ? fixes[0]! : null;
};
