import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  act,
} from '@testing-library/react';
import { useState } from 'react';
import type { AccountSettings, MeResponse, StoredAward } from '@oct/shared';
import { AwardsRoute, StreaksRoute } from '../../app/routes';
import { AWARD_TOAST_MS, AwardCelebration } from './AwardCelebration';
import { DataProvider, EMPTY_PROFILE } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { localToday } from '../diary/useToday';
import { periodPath } from '../week/period';
import { WeekScreen } from '../week/WeekScreen';
import { awardItems, nextAward } from './awards';
import { AWARDS_SOME, RUNNING, streaksOf } from './fixtures';

const user: MeResponse = {
  id: 8,
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

/** «First entry», granted retro (an import): not seen, no congratulation, but «New» (AC-3.5). */
const RETRO: StoredAward = {
  key: 'days_1',
  earnedOn: '2026-02-09',
  seen: false,
};

async function seed(
  streaksEnabled: boolean,
  stored: StoredAward[] = [RETRO],
  { quiet = stored.map((a) => a.key), fullSync = false } = {},
) {
  const db = await openUserDb(user.id);
  if (fullSync) await db.put('kv', 1, 'fullSyncAt');
  await db.put('kv', { ...settings, streaksEnabled }, 'settings');
  await db.put('kv', EMPTY_PROFILE, 'profile');
  await db.put('kv', 1, 'rev');
  for (const a of stored) await db.put('awards', a);
  await db.put('kv', quiet, 'awardsQuiet');
  db.close();
}

/** The route inside the app's data, and a way to leave it while the data stays. */
function Leavable({ children }: { children: React.ReactNode }) {
  const [on, setOn] = useState(true);
  return (
    <>
      <button onClick={() => setOn(false)}>leave</button>
      {on && children}
    </>
  );
}

async function wrap(node: React.ReactNode) {
  render(
    <I18nProvider>
      <DataProvider user={user}>
        <Leavable>
          <div data-testid="ready">{node}</div>
        </Leavable>
      </DataProvider>
    </I18nProvider>,
  );
  await screen.findByTestId('ready');
}

const seenQueued = async () => {
  const db = await openUserDb(user.id);
  const ops = await db.getAll('outbox');
  db.close();
  return ops.flatMap((o) =>
    o.kind === 'putAwards'
      ? o.body.filter((a) => a.seen).map((a) => a.key)
      : [],
  );
};

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

describe('All awards (OCT-184 5)', () => {
  it('hides a secret award not earned, «Photo» without photo AI; «New» on a retro award, seen on leaving', async () => {
    await seed(true);
    await wrap(<AwardsRoute />);
    const tile = await screen.findByRole('button', {
      name: /^First entry, common, got February 9, new$/,
    });
    expect(within(tile).getByText('New')).toBeTruthy();
    expect(screen.getByText('of 29 earned')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Photo' })).toBe(null);
    expect(screen.getByText('Secret: 0 of 6')).toBeTruthy();

    const secrets = screen.getAllByRole('button', {
      name: 'Secret award, not earned yet',
    });
    expect(secrets).toHaveLength(6);
    expect(screen.queryByText(/Welcome back/)).toBe(null);
    fireEvent.click(secrets[0]!);
    const card = await screen.findByRole('dialog', { name: 'Secret award' });
    expect(
      within(card).getByText(/Sometimes the main thing is coming back/),
    ).toBeTruthy();
    expect(within(card).queryByText(/Welcome back|break of 4 weeks/)).toBe(
      null,
    );
    expect(location.search).toBe('?award=secret_comeback');

    expect(await seenQueued()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'leave' }));
    await waitFor(async () => expect(await seenQueued()).toEqual(['days_1']));
  });

  it('opening a new award’s card on the streak screen marks it seen', async () => {
    await seed(true);
    await wrap(<StreaksRoute />);
    const block = await screen.findByRole('region', { name: 'Awards' });
    expect(within(block).getByText('Got 1 of 29')).toBeTruthy();
    fireEvent.click(
      within(block).getByRole('button', { name: /^First entry/ }),
    );
    const card = await screen.findByRole('dialog', { name: 'First entry' });
    expect(within(card).getByText('Log food for the first time')).toBeTruthy();
    expect(within(card).getByText('Got February 9')).toBeTruthy();
    await waitFor(async () => expect(await seenQueued()).toEqual(['days_1']));
  });
});

describe('New award strip (OCT-184 1.2)', () => {
  const NEW: StoredAward = { ...RETRO, seen: false };
  const live = { quiet: [], fullSync: true };
  /** The strip next to a screen that shows when the streaks have been read. */
  const withReady = async () => {
    await wrap(
      <>
        <AwardCelebration />
        <StreaksRoute />
      </>,
    );
    await screen.findByRole('region', { name: 'Awards' });
  };
  const strip = () => screen.queryByText('New award');

  it('shows once: seen goes to the queue, the next visit has no strip', async () => {
    await seed(true, [NEW], live);
    await wrap(<AwardCelebration />);
    expect(await screen.findByText('New award')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('First entry');
    await waitFor(async () => expect(await seenQueued()).toEqual(['days_1']));

    cleanup();
    await withReady();
    expect(strip()).toBe(null);
  });

  it('a retro award does not congratulate', async () => {
    await seed(true, [NEW], { fullSync: true });
    await withReady();
    expect(strip()).toBe(null);
    expect(await seenQueued()).toEqual([]);
  });

  it('streaks off: no strip', async () => {
    await seed(false, [NEW], live);
    await wrap(
      <>
        <AwardCelebration />
        <StreaksRoute />
      </>,
    );
    expect(await screen.findByText('Streaks and awards are off')).toBeTruthy();
    expect(strip()).toBe(null);
  });

  it('«View» opens All awards', async () => {
    await seed(true, [NEW], live);
    await wrap(<AwardCelebration />);
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    expect(location.pathname).toBe('/week/streaks/awards');
    expect(strip()).toBe(null);
  });

  it('goes by itself after 5 s', async () => {
    await seed(true, [NEW], live);
    // The strip's timer starts before findBy returns: fake timers that still run.
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout'],
    });
    await wrap(<AwardCelebration />);
    await screen.findByText('New award');
    // findBy may return before the effect that starts the timer has run.
    await act(async () => {});
    act(() => vi.advanceTimersByTime(AWARD_TOAST_MS));
    vi.useRealTimers();
    expect(strip()).toBe(null);
  });
});

describe('«N new» on the Week row (OCT-184 1.1)', () => {
  const week = () => (
    <WeekScreen
      mode="week"
      id={periodPath('week', localToday()).split('/')[2]!}
    />
  );

  it('counts unseen awards', async () => {
    await seed(true);
    await wrap(week());
    expect(await screen.findByText('1 new')).toBeTruthy();
  });

  it('off: no badge on Week, no awards block', async () => {
    await seed(false);
    await wrap(
      <>
        {week()}
        <StreaksRoute />
      </>,
    );
    expect(await screen.findByText('Streaks and awards are off')).toBeTruthy();
    expect(screen.queryByText('1 new')).toBe(null);
    expect(screen.queryByRole('region', { name: 'Awards' })).toBe(null);
  });
});

describe('awardItems, nextAward', () => {
  it('keeps «Photo» once a photo award is earned, even without photo AI (AC-3.10)', () => {
    const photo = { key: 'photo_1', earnedOn: '2026-02-09', seen: true };
    const items = awardItems({ awards: [], stored: [photo], photoAi: false });
    expect(items.some((a) => a.category === 'photo')).toBe(true);
    expect(
      awardItems({ awards: [], stored: [], photoAi: false }).some(
        (a) => a.category === 'photo',
      ),
    ).toBe(false);
  });

  it('«Next» is the open non-secret award closest to its target, ties by catalog order', () => {
    const items = awardItems(streaksOf(RUNNING, true, AWARDS_SOME));
    // weeks_52 31/52 = 0.60, streak_16 9/16 = 0.56, days_365 241/365 = 0.66, manual_25 18/25 = 0.72
    expect(nextAward(items)?.key).toBe('manual_25');
    const none = awardItems({ awards: [], stored: [], photoAi: true });
    expect(nextAward(none)?.key).toBe('weeks_1');
  });
});
