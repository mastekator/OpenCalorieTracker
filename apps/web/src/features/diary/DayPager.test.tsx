import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { DayPager } from './DayPager';

afterEach(cleanup);

const TODAY = '2026-11-12';

const show = (mode: 'week' | 'month', date: string) => {
  const onChange = vi.fn();
  return renderLoaded(
    <I18nProvider>
      <DayPager mode={mode} date={date} today={TODAY} onChange={onChange} />
    </I18nProvider>,
  ).then(() => onChange);
};

const button = (name: string) =>
  screen.getByRole('button', { name }) as HTMLButtonElement;

describe('DayPager in a period', () => {
  it('stops «›» on the current week', async () => {
    const onChange = await show('week', '2026-11-09');
    expect(screen.getByText('This week')).toBeTruthy();
    expect(button('Next week').disabled).toBe(true);
    fireEvent.click(button('Previous week'));
    expect(onChange).toHaveBeenCalledWith('2026-11-02');
  });

  it('turns a past week forward', async () => {
    const onChange = await show('week', '2026-11-02');
    expect(screen.getByText('Last week')).toBeTruthy();
    fireEvent.click(button('Next week'));
    expect(onChange).toHaveBeenCalledWith('2026-11-09');
  });

  it('stops «›» on the current month', async () => {
    await show('month', '2026-11-01');
    expect(screen.getByText('November')).toBeTruthy();
    expect(button('Next month').disabled).toBe(true);
    expect(button('Previous month').disabled).toBe(false);
  });
});
