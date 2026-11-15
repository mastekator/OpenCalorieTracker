import { describe, expect, it } from 'vitest';
import { barOf, chartScale } from './chartScale';

describe('chartScale', () => {
  it('leaves 15% headroom over the biggest day or the norm', () => {
    expect(chartScale([1850, 2380, 1960, 0], 2100)).toBeCloseTo(2737);
    expect(chartScale([500, 900], 2100)).toBeCloseTo(2415);
  });

  it('caps the axis at 2 × norm and clips the 6,000 day', () => {
    const top = chartScale([1850, 6000, 1960], 2000);
    expect(top).toBe(4000);
    expect(barOf(6000, 2000, top)).toEqual({
      height: 1,
      fill: 2000 / 4000,
      over: true,
      clipped: true,
    });
  });

  it('clips only a day above the top', () => {
    const top = chartScale([3400], 2000); // 3,910
    expect(barOf(3400, 2000, top).clipped).toBe(false);
    expect(barOf(4000, 2000, 4000).clipped).toBe(false);
    expect(barOf(4001, 2000, 4000).clipped).toBe(true);
  });

  it('scales to the biggest day without a norm, and never to zero', () => {
    expect(chartScale([1000, 2000], null)).toBeCloseTo(2300);
    expect(chartScale([0, 0], null)).toBe(1);
    expect(barOf(1000, null, 2300)).toMatchObject({ fill: 1, over: false });
  });

  it('splits an over-norm bar into fill and overrun', () => {
    expect(barOf(2380, 2100, 2737)).toMatchObject({
      height: 2380 / 2737,
      fill: 2100 / 2380,
      over: true,
    });
    expect(barOf(2100.4, 2100, 2737).over).toBe(false);
  });
});
