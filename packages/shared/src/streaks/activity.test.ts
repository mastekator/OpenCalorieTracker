import { describe, expect, it } from 'vitest';
import { activityMap } from './activity.js';

const at = (map: ReturnType<typeof activityMap>, date: string) =>
  map.weeks.flatMap((w) => w.days).find((c) => c?.date === date);

describe('activityMap', () => {
  it('covers the rolling year in Monday-first weeks across New Year', () => {
    const map = activityMap(
      [
        { date: '2026-01-01', meals: 9 },
        { date: '2026-01-06', meals: 1 },
        { date: '2026-12-31', meals: 2 },
        { date: '2027-01-04', meals: 5 },
        { date: '2027-01-05', meals: 0 },
      ],
      '2027-01-05',
    );
    expect(map.from).toBe('2026-01-06');
    expect(map.weeks[0]!.from).toBe('2026-01-05');
    expect(map.weeks.at(-1)!.from).toBe('2027-01-04');
    expect(map.weeks.every((w) => w.days.length === 7)).toBe(true);
    expect(map.weeks[0]!.days[0]).toBeNull(); // before the window, even with meals
    expect(at(map, '2026-01-06')).toEqual({
      date: '2026-01-06',
      meals: 1,
      level: 1,
    });
    expect(at(map, '2026-01-07')).toEqual({
      date: '2026-01-07',
      meals: 0,
      level: 0,
    });
    expect(at(map, '2026-12-31')!.level).toBe(2);
    expect(at(map, '2027-01-04')).toEqual({
      date: '2027-01-04',
      meals: 5,
      level: 3,
    });
    expect(at(map, '2027-01-05')!.level).toBe(0);
    expect(map.weeks.at(-1)!.days.slice(2)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]); // after today
  });

  it('starts the day after today a year ago in a leap year', () => {
    const map = activityMap([{ date: '2027-03-01', meals: 1 }], '2028-02-29');
    expect(map.from).toBe('2027-03-01');
    expect(at(map, '2027-03-01')!.level).toBe(1);
    expect(map.weeks.flatMap((w) => w.days).filter(Boolean)).toHaveLength(366);
  });

  it('leaves days before the first logged day empty', () => {
    const map = activityMap([{ date: '2026-11-25', meals: 1 }], '2026-11-26');
    const cells = map.weeks.flatMap((w) => w.days).filter(Boolean);
    expect(cells.map((c) => c!.date)).toEqual(['2026-11-25', '2026-11-26']);
    expect(
      activityMap([], '2026-11-26')
        .weeks.flatMap((w) => w.days)
        .every((c) => c === null),
    ).toBe(true);
  });
});
