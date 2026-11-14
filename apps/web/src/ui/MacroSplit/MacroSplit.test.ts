import { describe, expect, it } from 'vitest';
import { macroShares } from './MacroSplit';

describe('macroShares', () => {
  it('splits kcal 4/9/4 and always sums to 100', () => {
    expect(macroShares({ protein: 128, fat: 92, carbs: 355 })).toEqual({
      protein: 19,
      fat: 30,
      carbs: 51,
    });
    const s = macroShares({ protein: 33, fat: 33, carbs: 33 });
    expect(s.protein + s.fat + s.carbs).toBe(100);
    expect(macroShares({ protein: 0, fat: 0, carbs: 0 })).toEqual({
      protein: 0,
      fat: 0,
      carbs: 0,
    });
  });
});
