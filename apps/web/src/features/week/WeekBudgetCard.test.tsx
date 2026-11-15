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

const show = (days: DayTotals[], today: string, norm = true, daysLeft = 0) =>
  renderLoaded(
    <I18nProvider>
      <WeekBudgetCard
        mode="week"
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
      week('2026-11-09', [1850, 2380, 1960, 0, 0, 0, 0]),
      '2026-11-12',
      true,
      4,
    );
    expect(screen.getByText('Left this week')).toBeTruthy();
    expect(screen.getByText('8,510')).toBeTruthy();
    expect(screen.getByText('Average for the remaining 4 days')).toBeTruthy();
    expect(screen.getByText('2,128 kcal per day')).toBeTruthy();
    expect(
      screen.getByText('Eaten 6,190 of 14,700 kcal (2,100 × 7)'),
    ).toBeTruthy();
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
