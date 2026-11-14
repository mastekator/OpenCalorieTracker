import { describe, expect, it } from 'vitest';
import { dayLabel, diaryDay } from './day';

const t = (key: string) => (key === 'day.today' ? 'Today' : 'Yesterday');

describe('diaryDay', () => {
  it('keeps a past day and today, opens today for the future or a bad address', () => {
    expect(diaryDay('2026-11-10', '2026-11-14')).toBe('2026-11-10');
    expect(diaryDay('2026-11-14', '2026-11-14')).toBe('2026-11-14');
    expect(diaryDay('2026-11-15', '2026-11-14')).toBe('2026-11-14');
    expect(diaryDay('foo', '2026-11-14')).toBe('2026-11-14');
    expect(diaryDay('2026-13-01', '2026-11-14')).toBe('2026-11-14');
  });
});

describe('dayLabel', () => {
  it('names today and yesterday, formats other days, adds the year only for other years', () => {
    expect(dayLabel('2026-11-14', '2026-11-14', 'en', t)).toEqual({
      label: 'Today',
      year: null,
    });
    expect(dayLabel('2026-11-13', '2026-11-14', 'en', t).label).toBe(
      'Yesterday',
    );
    expect(dayLabel('2026-11-04', '2026-11-14', 'ru', t)).toEqual({
      label: 'ср, 4 ноября',
      year: null,
    });
    expect(dayLabel('2025-12-31', '2026-01-01', 'en', t)).toEqual({
      label: 'Yesterday',
      year: '2025',
    });
  });
});
