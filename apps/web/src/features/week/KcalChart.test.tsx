import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { DayTotals } from '@oct/shared';
import { I18nProvider } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { KcalChart } from './KcalChart';

afterEach(cleanup);

const day = (date: string, kcal: number): DayTotals => ({
  date,
  kcal,
  proteinG: 0,
  fatG: 0,
  carbsG: 0,
  meals: kcal ? 1 : 0,
});
const WEEK = [
  day('2026-11-09', 1850),
  day('2026-11-10', 2380),
  day('2026-11-11', 0),
  day('2026-11-12', 1240),
  day('2026-11-13', 0),
  day('2026-11-14', 0),
  day('2026-11-15', 0),
];

const show = (props: Partial<Parameters<typeof KcalChart>[0]> = {}) => {
  const onOpenDay = vi.fn();
  return renderLoaded(
    <I18nProvider>
      <KcalChart
        days={WEEK}
        norm={2100}
        today="2026-11-12"
        mode="week"
        onOpenDay={onOpenDay}
        {...props}
      />
    </I18nProvider>,
  ).then(() => onOpenDay);
};

describe('KcalChart', () => {
  it('labels the list and every bar for a screen reader (AC-3.7)', async () => {
    await show();
    expect(
      screen.getByRole('list', { name: 'Calories by day, goal 2,100 per day' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Mon, Nov 9: 1,850 of 2,100 kcal' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Tue, Nov 10: 2,380 of 2,100 kcal, 280 over',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Fri, Nov 13: not yet' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('opens the day on the first tap in a week', async () => {
    const open = await show();
    fireEvent.click(screen.getByRole('button', { name: /^Mon, Nov 9/ }));
    expect(open).toHaveBeenCalledWith('2026-11-09');
  });

  it('shows the value first and opens the day on the second tap in a month', async () => {
    const open = await show({ mode: 'month' });
    const bar = screen.getByRole('button', { name: /^Tue, Nov 10/ });
    fireEvent.click(bar);
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText('Tue, Nov 10: 2,380 of 2,100')).toBeTruthy();
    fireEvent.click(bar);
    expect(open).toHaveBeenCalledWith('2026-11-10');
  });

  it('drops the norm from labels and legend without a norm (7.5)', async () => {
    await show({ norm: null });
    expect(screen.getByRole('list', { name: 'Calories by day' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Tue, Nov 10: 2,380 kcal' }),
    ).toBeTruthy();
    expect(screen.queryByText('over goal')).toBeNull();
  });

  it('says so when the period has no entries (7.6)', async () => {
    await show({ days: WEEK.map((d) => day(d.date, 0)) });
    expect(screen.getByText('No entries this week')).toBeTruthy();
  });
});
