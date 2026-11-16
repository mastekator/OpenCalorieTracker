import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { addDays, type ProfileResponse } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import type { CardWeighing } from './WeightCard';
import { WeightView } from './WeightScreen';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const TODAY = '2026-11-16';
const PROFILE: ProfileResponse = {
  profile: {
    sex: 'male',
    birthDate: '1990-03-10',
    heightCm: 180,
    weightKg: 80.2,
    activity: 'light',
    goal: 'lose',
    targetWeightKg: 73,
    deadline: null,
  },
  manual: null,
  rev: 4,
};

const w = (
  date: string,
  weightKg: number,
  status: CardWeighing['status'] = 'synced',
): CardWeighing => ({ date, weightKg, status });
/** One weighing every `every` days for `count` weighings, ending today. */
const daily = (count: number, every = 1) =>
  Array.from({ length: count }, (_, i) =>
    w(addDays(TODAY, (i - count + 1) * every), 80 + (i % 7) * 0.1),
  );

type Props = ComponentProps<typeof WeightView>;
async function show(over: Partial<Props> = {}) {
  const props: Props = {
    today: TODAY,
    units: 'metric',
    weighings: daily(30, 7),
    profile: PROFILE,
    online: true,
    onAdd: vi.fn(),
    onEdit: vi.fn(),
    onSetGoal: vi.fn(),
    onMaintain: vi.fn(async () => {}),
    ...over,
  };
  const r = render(
    <I18nProvider>
      <WeightView {...props} />
    </I18nProvider>,
  );
  await screen.findByRole('radiogroup', { name: 'Period' });
  return { ...r, props };
}

/** Text with the non-breaking spaces as plain ones. */
const plain = (s: string | null) => s?.replaceAll('\u00a0', ' ');
const tip = (c: HTMLElement) =>
  plain(c.querySelector('.wchart__tip')!.textContent);
const dots = (c: HTMLElement) =>
  c.querySelector('.wchart__dots')?.getAttribute('d')?.match(/M/g)?.length ?? 0;

describe('WeightView', () => {
  it('shows 3 months by default and follows the period', async () => {
    // Weekly for 30 weeks: 14 in the last 3 months, 5 in the last month.
    const { container } = await show();
    expect(screen.getByRole('radio', { name: /^3.months$/ })).toHaveProperty(
      'ariaChecked',
      'true',
    );
    expect(dots(container)).toBe(14);
    screen.getByText(/^Trend over 3 months: /);
    expect(plain(screen.getByRole('img').getAttribute('aria-label'))).toMatch(
      /^Weight chart, 3 months: latest weigh-in 80\.\d kg, trend .+ kg, goal 73 kg\.$/,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Month' }));
    expect(dots(container)).toBe(5);
    screen.getByText(/^Trend over the past month: /);

    fireEvent.click(screen.getByRole('radio', { name: 'Year' }));
    expect(dots(container)).toBe(30);
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(dots(container)).toBe(30);
  });

  it('draws only the trend above 400 weighings', async () => {
    const { container } = await show({ weighings: daily(500) });
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(container.querySelector('.wchart__dots')).toBeNull();
    expect(container.querySelector('.wchart__trend')).not.toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Year' }));
    expect(container.querySelector('.wchart__dots')).not.toBeNull();
  });

  it('picks weighings with the keyboard and opens the pick', async () => {
    const { props, container } = await show();
    const plot = screen.getByRole('img', { name: /^Weight chart/ });
    expect(screen.queryByText('Edit')).toBeNull();
    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    // From nothing picked, ← starts at the latest weighing.
    expect(tip(container)).toMatch(/^Mon, Nov 16 · 80\.\d kg/);
    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    fireEvent.keyDown(plot, { key: 'Enter' });
    expect(props.onEdit).toHaveBeenCalledWith('2026-11-09');
    fireEvent.keyDown(plot, { key: 'Escape' });
    expect(screen.queryByText('Edit')).toBeNull();
  });

  it('a tap picks the nearest weighing, its tip or a second tap opens it', async () => {
    const { props, container } = await show({
      weighings: [
        w('2026-08-20', 82),
        w('2026-10-01', 81),
        w('2026-11-16', 80.2),
      ],
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Month' }));
    fireEvent.click(screen.getByRole('radio', { name: /^3.months$/ }));
    const plot = screen.getByRole('img', { name: /^Weight chart/ });
    // 3 months from Aug 16: 92 days over 920 px, 10 px a day.
    plot.getBoundingClientRect = () => ({ left: 0, width: 920 }) as DOMRect;
    const at = (day: number) => ({ pointerType: 'touch', clientX: day * 10 });

    fireEvent.pointerDown(plot, at(30)); // Sep 15: Aug 20 is 26 days off, Oct 1 is 16
    fireEvent.pointerUp(plot, at(30));
    expect(tip(container)).toBe('Thu, Oct 1 · 81.0 kgEdit');
    expect(props.onEdit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Edit'));
    expect(props.onEdit).toHaveBeenLastCalledWith('2026-10-01');

    fireEvent.pointerDown(plot, at(90));
    fireEvent.pointerUp(plot, at(90));
    expect(props.onEdit).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(plot, at(91));
    fireEvent.pointerUp(plot, at(91));
    expect(props.onEdit).toHaveBeenLastCalledWith('2026-11-16');
  });

  it('lists weighings by month, newest first, with the change since the one before', async () => {
    const { props } = await show({
      weighings: [
        w('2025-12-30', 82),
        w('2026-10-30', 81.4),
        w('2026-11-12', 80.6),
        w('2026-11-16', 80.6, 'pending'),
      ],
    });
    const months = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(months).toEqual(['November', 'October', 'December 2025']);
    const rows = screen
      .getAllByRole('button', { name: /kg$|waiting/ })
      .map((b) => plain(b.textContent));
    expect(rows).toEqual([
      'Mon, Nov 16waiting to sync0.080.6 kg',
      'Thu, Nov 12−0.880.6 kg',
      'Fri, Oct 30−0.681.4 kg',
      'Tue, Dec 3082.0 kg',
    ]);
    fireEvent.click(screen.getByRole('button', { name: /^Thu,.Nov.12/ }));
    expect(props.onEdit).toHaveBeenCalledWith('2026-11-12');
  });

  it('one weighing: no trend yet', async () => {
    const { container } = await show({ weighings: [w(TODAY, 80.2)] });
    screen.getByText('The trend appears after your third weigh-in');
    screen.getByText('First weigh-in');
    expect(container.querySelector('.wchart__last')).not.toBeNull();
    expect(container.querySelector('.wchart__trend')).toBeNull();
  });

  it('empty: an invitation, no chart', async () => {
    const onAdd = vi.fn();
    render(
      <I18nProvider>
        <WeightView
          today={TODAY}
          units="metric"
          weighings={[]}
          profile={PROFILE}
          online
          onAdd={onAdd}
          onEdit={vi.fn()}
          onSetGoal={vi.fn()}
          onMaintain={vi.fn(async () => {})}
        />
      </I18nProvider>,
    );
    await screen.findByText('No weigh-ins yet');
    expect(screen.queryByRole('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Log weight' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('10 years of daily weighings: 121 months, only the trend', async () => {
    const { container } = await show({ weighings: daily(3650) });
    expect(container.querySelectorAll('.weight-screen__month')).toHaveLength(
      121,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(container.querySelector('.wchart__dots')).toBeNull();
  });
});
