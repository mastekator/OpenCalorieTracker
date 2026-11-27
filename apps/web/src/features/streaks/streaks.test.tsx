import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AccountSettings, MeResponse, StreakState } from '@oct/shared';
import { StreaksRoute } from '../../app/routes';
import { DataProvider, EMPTY_PROFILE } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { localToday } from '../diary/useToday';
import { periodPath } from '../week/period';
import { WeekScreen } from '../week/WeekScreen';
import { StreakCard } from './StreakCard';

const user: MeResponse = {
  id: 7,
  email: 'kim@example.com',
  name: null,
  role: 'user',
  locale: 'en',
  theme: 'system',
  units: 'metric',
  normDisclaimerHidden: false,
  passwordFromConfig: false,
  methods: ['passkey'],
  enabledMethods: ['passkey'],
};
const settings: AccountSettings = {
  locale: 'en',
  theme: 'system',
  units: 'metric',
  settingsRev: 1,
  photoRetentionDays: 30,
  normDisclaimerHidden: false,
  offEnabled: false,
  offHintAt: null,
};

/** Born on January 1st `age` years ago: exactly that old today. */
const bornAgo = (age: number) =>
  `${Number(localToday().slice(0, 4)) - age}-01-01`;

async function seed(
  streaksEnabled: boolean | null | undefined,
  birthDate: string | null = null,
) {
  const db = await openUserDb(user.id);
  await db.put('kv', { ...settings, streaksEnabled }, 'settings');
  await db.put(
    'kv',
    { ...EMPTY_PROFILE, profile: { ...EMPTY_PROFILE.profile, birthDate } },
    'profile',
  );
  await db.put('kv', 1, 'rev');
  db.close();
}

async function wrap(node: ReactNode) {
  render(
    <I18nProvider>
      <DataProvider user={user}>
        <div data-testid="ready">{node}</div>
      </DataProvider>
    </I18nProvider>,
  );
  await screen.findByTestId('ready');
}

const week = () => (
  <WeekScreen
    mode="week"
    id={periodPath('week', localToday()).split('/')[2]!}
  />
);

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
});
afterEach(async () => {
  cleanup();
  history.replaceState(null, '', '/');
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await clearLocal(user.id);
});

describe('Streak row on Week (OCT-184 1.1)', () => {
  it('is shown while on and opens the streak screen', async () => {
    await seed(true);
    await wrap(week());
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Your streak starts with the first week that counts/,
      }),
    );
    expect(location.pathname).toBe('/week/streaks');
  });

  it.each([
    ['17 without a choice: off', null, 17, false],
    ['18 without a choice: on', null, 18, true],
    ['17 who turned it on: on', true, 17, true],
    ['an adult who turned it off: off', false, 30, false],
  ])('%s (AC-6.2)', async (_, enabled, age, on) => {
    await seed(enabled, bornAgo(age));
    // The streak screen reads the same value: its state says the read has landed.
    await wrap(
      <>
        {week()}
        <StreaksRoute />
      </>,
    );
    if (on) {
      expect(
        await screen.findByRole('button', {
          name: /first week that counts/,
        }),
      ).toBeTruthy();
    } else {
      expect(
        await screen.findByText('Streaks and awards are off'),
      ).toBeTruthy();
      expect(screen.queryByText(/first week that counts/)).toBe(null);
    }
  });
});

describe('Streak screen (OCT-184 §2, §3)', () => {
  it('off: explains, and «Turn on» sends the setting', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ...settings, streaksEnabled: true })),
    );
    await seed(false);
    await wrap(<StreaksRoute />);
    expect(await screen.findByText('Streaks and awards are off')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'How the streak works' })).toBe(
      null,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.find(
            ([url, init]) =>
              url === '/api/account/settings' && init?.method === 'PATCH',
          )?.[1]?.body,
      ).toMatch(/"streaksEnabled":true/),
    );
    expect(await screen.findByText(/first week that counts/)).toBeTruthy();
  });

  it('ⓘ opens the rules sheet', async () => {
    await seed(true);
    await wrap(<StreaksRoute />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'How the streak works' }),
    );
    expect(await screen.findByText(/at least 5 of 7 days/)).toBeTruthy();
    expect(location.search).toBe('?rules');
  });
});

describe('StreakCard', () => {
  const streak = (s: Partial<StreakState>): StreakState => ({
    current: 0,
    best: 0,
    freezes: 1,
    weeksToFreeze: 4,
    weeks: [],
    trail: [],
    week: { days: 0, target: 5, counted: false },
    ...s,
  });
  // Thursday, 19 November 2026.
  const today = '2026-11-19';

  it('days of this week: logged, empty, today and ahead', async () => {
    await renderLoaded(
      <I18nProvider>
        <StreakCard
          streak={streak({ week: { days: 2, target: 5, counted: false } })}
          days={[
            { date: '2026-11-16', meals: 2 },
            { date: '2026-11-17', meals: 0 },
            { date: '2026-11-19', meals: 1 },
          ]}
          today={today}
        />
      </I18nProvider>,
    );
    const days = within(await screen.findByRole('list', { name: 'This week' }))
      .getAllByRole('listitem')
      .map((li) => li.getAttribute('aria-label'));
    expect(days).toEqual([
      'Monday: logged',
      'Tuesday: no entries',
      'Wednesday: no entries',
      'Thursday, today: logged',
      'Friday: still ahead',
      'Saturday: still ahead',
      'Sunday: still ahead',
    ]);
    expect(screen.getByText('2 of 5 days this week')).toBeTruthy();
    expect(screen.getByText(/Your streak starts/)).toBeTruthy();
    // No trail before the first counted week (3.1).
    expect(screen.queryByRole('list', { name: 'Last 10 weeks' })).toBe(null);
  });

  it('trail follows the weeks, streak and best', async () => {
    await renderLoaded(
      <I18nProvider>
        <StreakCard
          streak={streak({
            current: 2,
            best: 9,
            trail: [
              { from: '2026-10-26', status: 'counted' },
              { from: '2026-11-02', status: 'short' },
              { from: '2026-11-09', status: 'frozen' },
              { from: '2026-11-16', status: 'current' },
            ],
            week: { days: 3, target: 5, counted: false },
          })}
          days={[]}
          today={today}
        />
      </I18nProvider>,
    );
    expect(await screen.findByText('2 weeks in a row')).toBeTruthy();
    expect(screen.getByText('Best streak: 9 weeks')).toBeTruthy();
    const weeks = within(screen.getByRole('list', { name: 'Last 10 weeks' }))
      .getAllByRole('listitem')
      .map((li) => li.getAttribute('aria-label'));
    expect(weeks).toEqual([
      'Week of October 26: counted',
      'Week of November 2: didn’t add up',
      'Week of November 9: frozen',
      'Week of November 16: in progress, 3 of 5 days',
    ]);
  });

  it('a counted week says so', async () => {
    await renderLoaded(
      <I18nProvider>
        <StreakCard
          streak={streak({
            current: 1,
            best: 1,
            trail: [{ from: '2026-11-16', status: 'counted' }],
            week: { days: 6, target: 5, counted: true },
          })}
          days={[]}
          today={today}
        />
      </I18nProvider>,
    );
    expect(await screen.findByText('Week counted')).toBeTruthy();
    expect(screen.getByText('6 of 7 days')).toBeTruthy();
    expect(screen.getByText('1 week in a row')).toBeTruthy();
  });
});
