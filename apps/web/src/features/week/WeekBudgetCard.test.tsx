import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { addDays, summarize, type DayTotals } from '@oct/shared';
import { I18nProvider } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { WeekBudgetCard } from './WeekBudgetCard';

afterEach(cleanup);

const NORM = { kcal: 2100, proteinG: 120, fatG: 70, carbsG: 250 };
const week = (from: string, kcals: number[]): DayTotals[] =>
  kcals.map((kcal, i) => ({
    date: addDays(from, i),
    kcal,
    proteinG: 0,
    fatG: 0,
    carbsG: 0,
    meals: kcal ? 1 : 0,
  }));

const show = (
  days: DayTotals[],
  today: string,
  norm = true,
  daysLeft = 0,
  mode: 'week' | 'month' = 'week',
) =>
  renderLoaded(
    <I18nProvider>
      <WeekBudgetCard
        mode={mode}
        summary={summarize(days, norm ? NORM : null, today)}
        norm={norm ? NORM.kcal : null}
        days={days.length}
        daysLeft={daysLeft}
      />
    </I18nProvider>,
  );

describe('WeekBudgetCard', () => {
  it('shows what is left and the per-day average in the current week', async () => {
    await show(
      week('2026-11-09', [2350, 2380, 1960, 0, 0, 0, 0]),
      '2026-11-12',
      true,
      4,
    );
    expect(screen.getByText('Left this week')).toBeTruthy();
    expect(screen.getByText('8,010')).toBeTruthy();
    expect(screen.getByText('Average for the remaining 4 days')).toBeTruthy();
    expect(screen.getByText('2,003 kcal per day')).toBeTruthy();
    expect(
      screen.getByText('Eaten 6,690 of 14,700 kcal (2,100 × 7)'),
    ).toBeTruthy();
  });

  it('caps the per-day average at the norm after a shortfall (OCT-167)', async () => {
    // 8,510 left / 4 days = 2,128 > 2,100
    await show(
      week('2026-11-09', [1850, 2380, 1960, 0, 0, 0, 0]),
      '2026-11-12',
      true,
      4,
    );
    expect(screen.getByText('Average for the remaining 4 days')).toBeTruthy();
    expect(screen.getByText('2,100 kcal per day — your norm')).toBeTruthy();
  });

  it('caps at the norm when the week has no entries yet', async () => {
    await show(
      week('2026-11-09', [0, 0, 0, 0, 0, 0, 0]),
      '2026-11-12',
      true,
      4,
    );
    expect(screen.getByText('2,100 kcal per day — your norm')).toBeTruthy();
  });

  it('shows exactly the norm without the mark on the first day', async () => {
    await show(
      week('2026-11-09', [0, 0, 0, 0, 0, 0, 0]),
      '2026-11-09',
      true,
      7,
    );
    expect(screen.getByText('2,100 kcal per day')).toBeTruthy();
    expect(screen.queryByText(/your norm/)).toBeNull();
  });

  it('caps the month the same way', async () => {
    const month = week('2026-11-01', [...Array<number>(30).fill(0)]);
    await show(month, '2026-11-12', true, 19, 'month');
    expect(screen.getByText('Left this month')).toBeTruthy();
    expect(screen.getByText('2,100 kcal per day — your norm')).toBeTruthy();
  });

  it('gives a past week its total and no per-day line (AC-3.10)', async () => {
    await show(
      week('2026-11-02', [2000, 2000, 2000, 2000, 2000, 2000, 2000]),
      '2026-11-12',
    );
    expect(screen.getByText('Week total')).toBeTruthy();
    expect(screen.getByText('14,000')).toBeTruthy();
    expect(screen.queryByText(/remaining/)).toBeNull();
  });

  it('says over for the week without a per-day line (E-3.6)', async () => {
    await show(
      week('2026-11-09', [4000, 4000, 4000, 3000, 0, 0, 0]),
      '2026-11-12',
      true,
      4,
    );
    expect(screen.getByText('Over for the week')).toBeTruthy();
    expect(screen.getByText('300')).toBeTruthy();
    expect(screen.queryByText(/remaining/)).toBeNull();
  });

  it('shows only what was eaten without a norm (7.5)', async () => {
    await show(
      week('2026-11-09', [1000, 500, 0, 0, 0, 0, 0]),
      '2026-11-12',
      false,
    );
    expect(screen.getByText('Eaten this week')).toBeTruthy();
    expect(screen.getByText('1,500')).toBeTruthy();
    expect(screen.queryByRole('meter')).toBeNull();
  });
});
