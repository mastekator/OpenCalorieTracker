import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import type { AccountSettings, MeResponse, StoredAward } from '@oct/shared';
import { AwardsRoute, StreaksRoute } from '../../app/routes';
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

async function seed(streaksEnabled: boolean, stored: StoredAward[] = [RETRO]) {
  const db = await openUserDb(user.id);
  await db.put('kv', { ...settings, streaksEnabled }, 'settings');
  await db.put('kv', EMPTY_PROFILE, 'profile');
  await db.put('kv', 1, 'rev');
  for (const a of stored) await db.put('awards', a);
  await db.put(
    'kv',
    stored.map((a) => a.key),
    'awardsQuiet',
  );
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
