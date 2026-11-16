import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { DayTotals } from '@oct/shared';
import { I18nProvider } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { dayAt, KcalChart } from './KcalChart';

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

  it('marks the tipped bar and closes the tip outside the chart or on Esc', async () => {
    await show({ mode: 'month' });
    const bar = screen.getByRole('button', { name: /^Tue, Nov 10/ });
    const tip = 'Tue, Nov 10: 2,380 of 2,100';
    fireEvent.click(bar);
    expect(bar.dataset.tip).toBe('true');
    fireEvent.pointerDown(bar);
    expect(screen.getByText(tip)).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText(tip)).toBeNull();
    expect(bar.dataset.tip).toBeUndefined();
    fireEvent.click(bar);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(tip)).toBeNull();
  });

  it('picks the column under the finger, capped to past days', () => {
    // 7 columns of 10 px each, 4 past days.
    expect(dayAt(15, 70, 7, 3)).toBe(1);
    expect(dayAt(20, 70, 7, 3)).toBe(2);
    expect(dayAt(69, 70, 7, 3)).toBe(3);
    expect(dayAt(-5, 70, 7, 3)).toBe(0);
  });

  describe('touch on the plot (OCT-168)', () => {
    // A 70 px plot: 10 px per day; Nov 10 is x 10..20, the gap after it is ~x 20.
    const touch = async (mode: 'week' | 'month') => {
      const open = await show({ mode });
      const plot = document.querySelector<HTMLElement>('.kchart__plot')!;
      plot.getBoundingClientRect = () => ({ left: 100, width: 70 }) as DOMRect;
      const at = (x: number) => ({ pointerType: 'touch', clientX: 100 + x });
      const tap = (x: number, target: Element = plot) => {
        fireEvent.pointerDown(target, at(x));
        fireEvent.pointerUp(target, at(x));
        fireEvent.click(target);
      };
      return { open, plot, at, tap };
    };
    const tipOf = (d: string) => screen.queryByText(new RegExp(`^${d}:`));

    it('shows the nearest day on a tap in a gap and opens it on the second tap', async () => {
      const { open, tap } = await touch('month');
      tap(19.5);
      expect(tipOf('Tue, Nov 10')).toBeTruthy();
      expect(open).not.toHaveBeenCalled();
      tap(12, screen.getByRole('button', { name: /^Tue, Nov 10/ }));
      expect(open).toHaveBeenCalledOnce();
      expect(open).toHaveBeenCalledWith('2026-11-10');
    });

    it('a tap right of today picks today', async () => {
      const { tap } = await touch('month');
      tap(65);
      expect(tipOf('Thu, Nov 12')).toBeTruthy();
    });

    it('a drag moves the tip and opens nothing', async () => {
      const { open, plot, at } = await touch('month');
      fireEvent.pointerDown(plot, at(5));
      expect(tipOf('Mon, Nov 9')).toBeTruthy();
      fireEvent.pointerMove(plot, at(35));
      expect(tipOf('Thu, Nov 12')).toBeTruthy();
      fireEvent.pointerMove(plot, at(5));
      fireEvent.pointerUp(plot, at(5));
      expect(tipOf('Mon, Nov 9')).toBeTruthy();
      expect(open).not.toHaveBeenCalled();
    });

    it('opens nothing when the browser cancels the touch for a scroll', async () => {
      const { open, plot, at } = await touch('week');
      fireEvent.pointerDown(plot, at(5));
      fireEvent.pointerCancel(plot, at(5));
      fireEvent.pointerUp(plot, at(5));
      expect(open).not.toHaveBeenCalled();
    });

    it('opens the day on the first tap in a week, once', async () => {
      const { open, tap } = await touch('week');
      tap(5, screen.getByRole('button', { name: /^Mon, Nov 9/ }));
      expect(open).toHaveBeenCalledOnce();
      expect(open).toHaveBeenCalledWith('2026-11-09');
    });

    it('the keyboard still works after a touch', async () => {
      const { open, plot, at } = await touch('week');
      fireEvent.pointerDown(plot, at(5));
      fireEvent.pointerCancel(plot, at(5));
      const bar = screen.getByRole('button', { name: /^Tue, Nov 10/ });
      fireEvent.keyDown(bar, { key: 'Enter' });
      fireEvent.click(bar);
      expect(open).toHaveBeenCalledWith('2026-11-10');
    });
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
