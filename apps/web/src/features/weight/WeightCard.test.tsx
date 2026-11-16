import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { ProfileResponse } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { WeightCard, type CardWeighing } from './WeightCard';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

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
const DIARY = [w('2026-11-12', 80.6), w('2026-11-16', 80.2)];

type Props = ComponentProps<typeof WeightCard>;
function show(
  over: Partial<Props> & { goal?: Partial<ProfileResponse['profile']> } = {},
) {
  const { goal, ...rest } = over;
  const props: Props = {
    today: '2026-11-16',
    units: 'metric',
    weighings: DIARY,
    profile: { ...PROFILE, profile: { ...PROFILE.profile, ...goal } },
    online: true,
    onAdd: vi.fn(),
    onOpen: vi.fn(),
    onSetGoal: vi.fn(),
    onMaintain: vi.fn(async () => {}),
    onRetry: vi.fn(),
    ...rest,
  };
  render(
    <I18nProvider>
      <WeightCard {...props} />
    </I18nProvider>,
  );
  return props;
}

const target = () => document.querySelector('.weight-card__target');

describe('WeightCard', () => {
  it('keeps small swings small: the chart spans at least 2 kg, data centered', async () => {
    show({ goal: { goal: 'maintain' } });
    await screen.findByText('80.2');
    const ys = document
      .querySelector('.weight-card__line')!
      .getAttribute('points')!
      .split(' ')
      .map((p) => Number(p.split(',')[1]));
    // 80.6 and 80.2 within 79.4..81.4 on a 6..50 px plot.
    expect(ys[0]).toBeCloseTo(23.6);
    expect(ys[1]).toBeCloseTo(32.4);
  });

  it('opens the weight screen from «All weigh-ins», the weight and the chart', async () => {
    const { onOpen, onRetry } = show({
      weighings: [w('2026-11-12', 80.6), w('2026-11-16', 80.2, 'error')],
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'All weigh-ins' }),
    );
    fireEvent.click(screen.getByText('80.2'));
    fireEvent.click(screen.getByRole('img', { name: 'Weight over 30 days' }));
    expect(onOpen).toHaveBeenCalledTimes(3);
    // «Try again» sits in the same area but only retries.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it('drops the chart when no weighing is in the last 30 days', async () => {
    show({ weighings: [w('2026-09-01', 80.2)] });
    expect(await screen.findByText('80.2')).toBeTruthy();
    expect(document.querySelector('.weight-card__spark')).toBeNull();
  });

  it('shows the latest weight, when, the change and the goal left (1.1)', async () => {
    show();
    expect(await screen.findByText('80.2')).toBeTruthy();
    expect(screen.getByText('· today')).toBeTruthy();
    expect(screen.getByText('−0.4 kg since Nov 12')).toBeTruthy();
    expect(screen.getByText('· 7.2 kg to go')).toBeTruthy();
    expect(target()).toBeTruthy();
  });

  it('signs a gain with +, no change as 0.0, and an old weighing by days', async () => {
    show({
      weighings: [w('2026-11-10', 80.2), w('2026-11-13', 80.6)],
    });
    expect(await screen.findByText('+0.4 kg since Nov 10')).toBeTruthy();
    expect(screen.getByText('· 3 days ago')).toBeTruthy();
    cleanup();
    show({ weighings: [w('2026-11-12', 80.2), w('2026-11-15', 80.2)] });
    expect(await screen.findByText('0.0 kg since Nov 12')).toBeTruthy();
    expect(screen.getByText('· yesterday')).toBeTruthy();
  });

  it('says «First weigh-in» for a single weighing (1.3)', async () => {
    show({ weighings: [w('2026-11-16', 80.2)] });
    expect(await screen.findByText('First weigh-in')).toBeTruthy();
  });

  it('invites to log with no weighings; the button opens the sheet (1.2)', async () => {
    const p = show({ weighings: [] });
    expect(await screen.findByText('Log your weight')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Log weight' }));
    expect(p.onAdd).toHaveBeenCalled();
  });

  it('is a busy skeleton while loading', async () => {
    show({ weighings: undefined });
    const card = await screen.findByRole('region', { name: 'Weight' });
    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('without a goal offers to set one (1.5)', async () => {
    const p = show({ goal: { goal: null, targetWeightKg: null } });
    expect(await screen.findByText('No goal set')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set goal' }));
    expect(p.onSetGoal).toHaveBeenCalled();
    expect(target()).toBeNull();
  });

  it('lose without a target weight also offers to set one', async () => {
    show({ goal: { targetWeightKg: null } });
    expect(await screen.findByText('No goal set')).toBeTruthy();
  });

  it('«maintain» has no remainder and no goal line (1.5)', async () => {
    show({ goal: { goal: 'maintain', targetWeightKg: null } });
    expect(await screen.findByText('Goal: maintain weight')).toBeTruthy();
    expect(screen.queryByText(/to go/)).toBeNull();
    expect(target()).toBeNull();
  });

  it('under 18 has no goal row and no goal line (AC-9.18)', async () => {
    show({ goal: { birthDate: '2010-01-01' } });
    await screen.findByText('80.2');
    expect(screen.queryByText(/Goal|No goal/)).toBeNull();
    expect(target()).toBeNull();
  });

  it('shows everything in lb (E-9.2)', async () => {
    show({ units: 'us' });
    expect(await screen.findByText('176.8')).toBeTruthy();
    expect(screen.getByText('−0.9 lb since Nov 12')).toBeTruthy();
    expect(screen.getByText(/Goal 160\.9 lb/)).toBeTruthy();
    expect(screen.getByText('· 15.9 lb to go')).toBeTruthy();
  });

  it('offers «Maintain» once reached; «Not now» leaves «reached» (1.4)', async () => {
    const p = show({
      weighings: [w('2026-11-12', 73.4), w('2026-11-16', 72.8)],
    });
    expect(await screen.findByText('Goal reached · 73 kg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    expect(p.onMaintain).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Goal reached · 73 kg')).toBeNull();
    expect(screen.getByText('· reached')).toBeTruthy();
    // The same «Not now» the profile form reads (8.13).
    expect(localStorage.getItem('oct.goalReached.laterRev')).toBe('4');
  });

  it('«Switch» is greyed out offline', async () => {
    show({ online: false, weighings: [w('2026-11-16', 72.8)] });
    const go = await screen.findByRole('button', { name: 'Switch' });
    expect((go as HTMLButtonElement).disabled).toBe(true);
  });

  it('with an own goal set, reaching the target just says so', async () => {
    show({
      weighings: [w('2026-11-16', 72.8)],
      profile: {
        ...PROFILE,
        manual: { kcal: 2000, proteinPct: 30, fatPct: 30, carbsPct: 40 },
      },
    });
    expect(await screen.findByText('· reached')).toBeTruthy();
    expect(screen.queryByText(/Goal reached/)).toBeNull();
  });

  it('marks an unsent weighing «waiting to sync»', async () => {
    show({
      weighings: [w('2026-11-12', 80.6), w('2026-11-16', 80.2, 'pending')],
    });
    expect(await screen.findByText('waiting to sync')).toBeTruthy();
    expect(
      screen.getByText('Your target updates once this is sent'),
    ).toBeTruthy();
  });

  it('drops the target note once the weighing is sent', async () => {
    show({ weighings: [w('2026-11-12', 80.6), w('2026-11-16', 80.2)] });
    await screen.findByText('Log weight');
    expect(
      screen.queryByText('Your target updates once this is sent'),
    ).toBeNull();
  });

  it('a refused weighing says «not saved» and sends it again', async () => {
    const latest = w('2026-11-16', 80.2, 'error');
    const p = show({ weighings: [w('2026-11-12', 80.6), latest] });
    expect(await screen.findByText('not saved')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(p.onRetry).toHaveBeenCalledWith(latest);
  });
});
