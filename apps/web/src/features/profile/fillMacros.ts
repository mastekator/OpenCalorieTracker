export const MACROS = ['protein', 'fat', 'carbs'] as const;
export type Macro = (typeof MACROS)[number];
export type Pct = Record<Macro, number>;

/**
 * Brings the macro shares to 100 % (OCT-22 «Filling the shares»): the rest goes
 * to carbs, or to fat if carbs were edited last. If that share would drop below 0,
 * it stops at 0 and the other two give up the excess.
 */
export function fillMacros(
  pct: Pct,
  lastEdited: Macro | null,
): { pct: Pct; target: Macro } {
  const target: Macro = lastEdited === 'carbs' ? 'fat' : 'carbs';
  const next = { ...pct };
  next[target] += 100 - (pct.protein + pct.fat + pct.carbs);
  if (next[target] < 0) {
    const excess = -next[target];
    next[target] = 0;
    const [a, b] = MACROS.filter((m) => m !== target) as [Macro, Macro];
    // Half from each; whatever one can't give, the other does.
    const fromA = Math.min(next[a], Math.ceil(excess / 2));
    const fromB = Math.min(next[b], excess - fromA);
    next[a] -= fromA + (excess - fromA - fromB);
    next[b] -= fromB;
  }
  return { pct: next, target };
}
