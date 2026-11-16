import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { DayCalendar } from './DayCalendar';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

async function setup(props: { value: string; min?: string }) {
  const onChange = vi.fn();
  await renderLoaded(
    <I18nProvider>
      <DayCalendar
        today="2026-11-16"
        marked={new Set(['2026-11-12', '2026-11-16'])}
        onChange={onChange}
        {...props}
      />
    </I18nProvider>,
  );
  const day = (name: string | RegExp) =>
    screen.getByRole('button', { name }) as HTMLButtonElement;
  return { onChange, day };
}

describe('DayCalendar', () => {
  it('shows the month of the value, Monday first', async () => {
    await setup({ value: '2026-11-14' });
    screen.getByText('November 2026');
    expect(
      [...document.querySelectorAll('.day-cal__weekday')].map(
        (h) => h.textContent,
      ),
    ).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  it('disables days after today and before the minimum', async () => {
    const { onChange, day } = await setup({
      value: '2026-11-14',
      min: '2026-11-10',
    });
    expect(day('November 17, 2026').disabled).toBe(true);
    expect(day('November 9, 2026').disabled).toBe(true);
    expect(day('November 10, 2026').disabled).toBe(false);
    expect(day('Previous month').disabled).toBe(true);
    expect(day('Next month').disabled).toBe(true);
    fireEvent.click(day('November 10, 2026'));
    expect(onChange).toHaveBeenCalledWith('2026-11-10');
  });

  it('marks days with a weighing, today and the selected day', async () => {
    const { day } = await setup({ value: '2026-11-14' });
    expect(day('November 12, 2026, has a weighing').className).toContain(
      'day-cal__day--has',
    );
    expect(day('November 13, 2026').className).not.toContain('--has');
    const today = day('November 16, 2026, has a weighing');
    expect(today.getAttribute('aria-current')).toBe('date');
    expect(day('November 14, 2026').getAttribute('aria-pressed')).toBe('true');
  });

  it('pages months back and forward up to today', async () => {
    const { day } = await setup({ value: '2026-11-14' });
    fireEvent.click(day('Previous month'));
    screen.getByText('October 2026');
    expect(day('October 31, 2026').disabled).toBe(false);
    fireEvent.click(day('Next month'));
    screen.getByText('November 2026');
  });
});
