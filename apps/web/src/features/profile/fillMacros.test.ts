import { describe, expect, it } from 'vitest';
import { fillMacros } from './fillMacros';

describe('fillMacros', () => {
  it('adds the rest to carbs', () => {
    expect(fillMacros({ protein: 21, fat: 30, carbs: 44 }, 'protein')).toEqual({
      pct: { protein: 21, fat: 30, carbs: 49 },
      target: 'carbs',
    });
  });

  it('adds the rest to fat when carbs were edited last', () => {
    expect(fillMacros({ protein: 20, fat: 30, carbs: 45 }, 'carbs')).toEqual({
      pct: { protein: 20, fat: 35, carbs: 45 },
      target: 'fat',
    });
  });

  it('takes the extra away when the shares are over 100', () => {
    expect(fillMacros({ protein: 25, fat: 30, carbs: 50 }, null).pct).toEqual({
      protein: 25,
      fat: 30,
      carbs: 45,
    });
  });

  it('splits what is left between the other two below 0', () => {
    expect(fillMacros({ protein: 60, fat: 60, carbs: 10 }, 'fat').pct).toEqual({
      protein: 50,
      fat: 50,
      carbs: 0,
    });
    // One of the two can't give its half: the other gives the rest.
    expect(fillMacros({ protein: 1, fat: 110, carbs: 2 }, 'fat').pct).toEqual({
      protein: 0,
      fat: 100,
      carbs: 0,
    });
  });
});
