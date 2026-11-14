import { describe, expect, it } from 'vitest';
import { isLate, localClock } from './mealTime';

describe('isLate', () => {
  it('is true for 00:35 counted to the previous day', () => {
    const meal = {
      eatenAt: '2026-11-12T21:35:00Z',
      tzOffsetMin: 180, // 00:35 on Nov 13 in Moscow
      localDate: '2026-11-12',
    };
    expect(localClock(meal).toISOString().slice(11, 16)).toBe('00:35');
    expect(isLate(meal)).toBe(true);
  });

  it('is false for a dinner on its own day, west of UTC too', () => {
    expect(
      isLate({
        eatenAt: '2026-11-13T02:30:00Z',
        tzOffsetMin: -300, // 21:30 on Nov 12 in New York
        localDate: '2026-11-12',
      }),
    ).toBe(false);
  });
});
