import { describe, expect, it } from 'vitest';
import {
  cmToFtIn,
  ftInToCm,
  unitRanges,
  weightFromKg,
  weightToKg,
} from './units.js';

describe('units', () => {
  it('matches the ADR examples', () => {
    expect(weightToKg(180, 'us')).toBeCloseTo(81.6466266, 6);
    expect(weightFromKg(weightToKg(180, 'us'), 'us')).toBe(180);
    expect(ftInToCm(5, 11)).toBeCloseTo(180.34, 9);
    expect(cmToFtIn(180.34)).toEqual({ ft: 5, in: 11 });
    expect(weightFromKg(80, 'us')).toBe(176.4);
    expect(weightFromKg(weightToKg(176.4, 'us'), 'metric')).toBe(80);
  });

  it('rounds input in the user system (E-1.3)', () => {
    expect(weightToKg(72.54, 'metric')).toBe(72.5);
    expect(weightToKg(180.04, 'us')).toBe(weightToKg(180, 'us'));
  });

  it('gives inward-rounded ranges (product §1)', () => {
    expect(unitRanges('metric')).toEqual({
      height: { min: 100, max: 250 },
      weight: { min: 30, max: 300 },
    });
    expect(unitRanges('us')).toEqual({
      height: { min: 40, max: 98 },
      weight: { min: 66.2, max: 661.3 },
    });
  });

  it('round-trips every value of the range without drift (AC-0.4b)', () => {
    const { height, weight } = unitRanges('us');
    for (let t = weight.min * 10; t <= weight.max * 10; t++) {
      const lb = t / 10;
      const kg = weightToKg(lb, 'us');
      expect(kg).toBeGreaterThanOrEqual(30);
      expect(kg).toBeLessThanOrEqual(300);
      if (weightFromKg(kg, 'us') !== lb) expect.fail(`${lb} lb drifted`);
    }
    for (let t = 300; t <= 3000; t++) {
      const kg = t / 10;
      if (weightFromKg(weightToKg(kg, 'metric'), 'metric') !== kg)
        expect.fail(`${kg} kg drifted`);
    }
    for (let inches = height.min; inches <= height.max; inches++) {
      const ft = Math.floor(inches / 12);
      const cm = ftInToCm(ft, inches % 12);
      expect(cm).toBeGreaterThanOrEqual(100);
      expect(cm).toBeLessThanOrEqual(250);
      expect(cmToFtIn(cm)).toEqual({ ft, in: inches % 12 });
    }
  });
});
