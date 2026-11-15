/**
 * Top of the kcal axis (E-3.4): `max(biggest day, norm) × 1.15`, but never above `2 × norm`,
 * so the norm line always sits inside the plot. Without a norm, `biggest day × 1.15`.
 */
export function chartScale(kcals: readonly number[], norm: number | null) {
  const top = Math.max(norm ?? 0, ...kcals) * 1.15;
  return (norm ? Math.min(top, 2 * norm) : top) || 1;
}

/**
 * One bar against the axis top, all shares 0..1: `height` of the plot, `fill` of the bar up
 * to the norm (the rest is the hatched overrun), `clipped` when the day is above the top.
 */
export function barOf(kcal: number, norm: number | null, top: number) {
  const shown = Math.min(kcal, top);
  // Over is decided on the rounded numbers the labels show (E-1.1).
  const over = !!norm && Math.round(kcal) > Math.round(norm);
  return {
    height: shown / top,
    fill: over ? norm / shown : 1,
    over,
    clipped: kcal > top,
  };
}
