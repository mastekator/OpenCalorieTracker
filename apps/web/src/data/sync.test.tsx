import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type {
  Meal,
  MeResponse,
  ProfileResponse,
  SyncResponse,
} from '@oct/shared';
import { useRef, type ReactNode } from 'react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';
import { ToastProvider } from '../ui/Toast/Toast';
import { DataProvider, useMeals, useNorm } from './DataContext';
import { openUserDb, type Db } from './db';
import {
  flush,
  patchSettings,
  putAwards,
  putChallengeMonth,
  putWeighing,
} from './outbox';
import { pull, storeProfile } from './sync';
import { clearLocal } from './user';

const meal = (clientId: string, localDate = '2026-11-14'): Meal => ({
  id: 1,
  clientId,
  eatenAt: `${localDate}T12:00:00.000Z`,
  tzOffsetMin: 0,
  localDate,
  mealType: 'lunch',
  photo: null,
  recalcOffer: false,
  items: [],
  kcal: 500,
  proteinG: 20,
  fatG: 10,
  carbsG: 60,
});

const PROFILE: ProfileResponse = {
  profile: {
    sex: 'male',
    birthDate: '1996-01-01',
    heightCm: 180,
    weightKg: 80,
    activity: 'moderate',
    goal: 'maintain',
    targetWeightKg: null,
    deadline: null,
  },
  manual: { kcal: 2000, proteinPct: 30, fatPct: 30, carbsPct: 40 },
  rev: 1,
};

const page = (p: Partial<SyncResponse>): SyncResponse => ({
  rev: 1,
  more: false,
  meals: [],
  deletedMealClientIds: [],
  ...p,
});

/** Answers /api/sync with `pages` in order and records the requested URLs. */
function serve(...pages: SyncResponse[]) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      return Response.json(pages.shift());
    }),
  );
  return urls;
}

const withApp = (node: ReactNode) => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  return (
    <I18nProvider>
      <ToastProvider>{node}</ToastProvider>
    </I18nProvider>
  );
};

let db: Db;
const open = async () => (db = await openUserDb(7));

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  db?.close();
  await clearLocal(7);
});

describe('pull', () => {
  it('applies weighings but keeps a day with a queued op', async () => {
    await open();
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    await db.put('kv', PROFILE, 'profile');
    await putWeighing(db, '2026-11-14', 79);
    await db.put('weighings', { date: '2026-11-01', weightKg: 81 });
    serve(
      page({
        rev: 2,
        profile: { ...PROFILE, rev: 2 },
        weighings: [
          { date: '2026-11-14', weightKg: 85 },
          { date: '2026-11-10', weightKg: 80 },
          { date: '2026-11-01', weightKg: null },
        ],
      }),
    );
    await pull(db);
    expect(await db.getAll('weighings')).toEqual([
      { date: '2026-11-10', weightKg: 80 },
      { date: '2026-11-14', weightKg: 79 },
    ]);
    // The server profile does not know the queued weighing yet.
    expect(
      ((await db.get('kv', 'profile')) as ProfileResponse).profile.weightKg,
    ).toBe(79);
  });

  it('applies meals, settings and illustration choices and stores rev', async () => {
    await open();
    const settings = { locale: 'en', theme: 'dark', units: 'metric' };
    serve(
      page({
        rev: 4,
        meals: [meal('a')],
        settings: settings as SyncResponse['settings'],
        illustrationChoices: [{ nameKey: 'soup', illustration: 'soup' }],
      }),
    );
    await pull(db);
    expect(await db.get('meals', 'a')).toEqual(meal('a'));
    expect(await db.get('kv', 'settings')).toEqual(settings);
    expect(await db.get('kv', 'choices')).toEqual({ soup: 'soup' });
    expect(await db.get('kv', 'rev')).toBe(4);
  });

  it('follows more with since = last rev', async () => {
    await open();
    const urls = serve(
      page({ rev: 500, more: true, meals: [meal('a')] }),
      page({ rev: 501, meals: [meal('b')] }),
    );
    await pull(db);
    expect(urls).toEqual(['/api/sync?since=0', '/api/sync?since=500']);
    expect(await db.getAllKeys('meals')).toEqual(['a', 'b']);
    serve(page({ rev: 501 }));
    await pull(db);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('/api/sync?since=501');
  });

  it('deletes meals and forgets choices reset to automatic', async () => {
    await open();
    serve(
      page({
        rev: 1,
        meals: [meal('a'), meal('b')],
        illustrationChoices: [{ nameKey: 'soup', illustration: 'soup' }],
      }),
      page({
        rev: 2,
        deletedMealClientIds: ['a'],
        illustrationChoices: [{ nameKey: 'soup', illustration: null }],
      }),
    );
    await pull(db);
    await pull(db);
    expect(await db.getAllKeys('meals')).toEqual(['b']);
    expect(await db.get('kv', 'choices')).toEqual({});
  });

  it('keeps a meal with an unsent change, but still applies its deletion', async () => {
    await open();
    const local = { ...meal('a'), kcal: 1 };
    await db.put('meals', local);
    await db.add('outbox', { clientId: 'a', kind: 'deleteMeal', id: 1 });
    serve(
      page({ rev: 1, meals: [meal('a')] }),
      page({ rev: 2, deletedMealClientIds: ['a'] }),
    );
    await pull(db);
    expect(await db.get('meals', 'a')).toEqual(local);
    await pull(db);
    expect(await db.get('meals', 'a')).toBeUndefined();
  });

  it('keeps settings and a choice with an unsent change, applies the rest', async () => {
    await open();
    const local = { theme: 'dark', photoRetentionDays: 7 };
    await db.put('kv', local as never, 'settings');
    await db.put('kv', { soup: 'pizza' }, 'choices');
    await db.add('outbox', {
      clientId: 'photoRetention',
      kind: 'putPhotoRetention',
      body: { days: 7 },
    });
    await db.add('outbox', {
      clientId: 'choice:soup',
      kind: 'putIllustrationChoice',
      body: { name: 'soup', illustration: 'pizza' },
    });
    serve(
      page({
        settings: { theme: 'light' } as SyncResponse['settings'],
        illustrationChoices: [
          { nameKey: 'soup', illustration: 'soup' },
          { nameKey: 'fish', illustration: 'fish' },
        ],
      }),
    );
    await pull(db);
    expect(await db.get('kv', 'settings')).toEqual(local);
    expect(await db.get('kv', 'choices')).toEqual({
      soup: 'pizza',
      fish: 'fish',
    });
  });

  it('stores the profile, but not over a newer saved one', async () => {
    await open();
    serve(page({ rev: 3, profile: { ...PROFILE, rev: 3 } }));
    await pull(db);
    expect(await db.get('kv', 'profile')).toEqual({ ...PROFILE, rev: 3 });
    await storeProfile(db, { ...PROFILE, manual: null, rev: 9 });
    serve(page({ rev: 4, profile: { ...PROFILE, rev: 4 } }));
    await pull(db);
    expect(await db.get('kv', 'profile')).toMatchObject({ rev: 9 });
  });

  it('sets fullSyncAt only after the last page of a pull from 0', async () => {
    await open();
    serve(page({ rev: 5, more: true }), page({ rev: 6, more: true }));
    await expect(pull(db)).rejects.toThrow();
    expect(await db.get('kv', 'fullSyncAt')).toBeUndefined();
    const urls = serve(page({ rev: 7 }));
    await pull(db);
    expect(urls).toEqual(['/api/sync?since=0']);
    expect(await db.get('kv', 'fullSyncAt')).toBeTypeOf('number');
  });

  it('pulls from 0 once on a client with rev but no fullSyncAt', async () => {
    await open();
    await db.put('kv', 40, 'rev');
    const award = { key: 'days_1', earnedOn: '2026-11-01', seen: true };
    const urls = serve(page({ rev: 41, awards: [award] }));
    await pull(db);
    expect(urls).toEqual(['/api/sync?since=0']);
    expect(await db.getAll('awards')).toEqual([award]);
    serve(page({ rev: 41 }));
    await pull(db);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('/api/sync?since=41');
  });

  it('applies awards and months but keeps the ones with a queued op', async () => {
    await open();
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    const mine = { key: 'days_1', earnedOn: '2026-11-02', seen: false };
    await putAwards(db, [mine]);
    await putChallengeMonth(db, '2026-11', {
      keys: ['days_20'],
      done: {},
      closed: false,
    });
    await flush(db).catch(() => {});
    const october = {
      month: '2026-10',
      keys: ['profile'],
      done: {},
      closed: true,
    };
    serve(
      page({
        awards: [{ key: 'days_30', earnedOn: '2026-11-01', seen: true }],
        challengeMonths: [
          october,
          { month: '2026-11', keys: ['photo_20'], done: {}, closed: false },
        ],
      }),
    );
    await pull(db);
    expect(await db.getAll('awards')).toEqual([mine]);
    expect(await db.getAll('challengeMonths')).toEqual([
      october,
      { month: '2026-11', keys: ['days_20'], done: {}, closed: false },
    ]);
  });

  it('runs one pull at a time', async () => {
    await open();
    const urls = serve(page({ rev: 1 }));
    await Promise.all([pull(db), pull(db)]);
    expect(urls).toHaveLength(1);
  });
});

describe('useMeals', () => {
  it('shows the day’s meals and re-reads after a pull', async () => {
    const user = { id: 7, email: 'a@example.com' } as MeResponse;
    serve(page({ rev: 1, meals: [meal('a'), meal('b', '2026-11-13')] }));
    function Day() {
      const meals = useMeals('2026-11-14');
      return <p>{meals ? `meals: ${meals.map((m) => m.clientId)}` : '…'}</p>;
    }
    render(
      withApp(
        <DataProvider user={user}>
          <Day />
        </DataProvider>,
      ),
    );
    expect(await screen.findByText('meals: a')).toBeTruthy();

    await open();
    serve(page({ rev: 2, meals: [meal('c')] }));
    await act(() => pull(db));
    expect(await screen.findByText('meals: a,c')).toBeTruthy();
  });

  it('shows the last read meals at once on a remount, not after a new database', async () => {
    const user = { id: 7, email: 'a@example.com' } as MeResponse;
    serve(page({ rev: 1, meals: [meal('a')] }));
    const firsts: unknown[] = [];
    function Day() {
      const meals = useMeals('2026-11-14');
      const first = useRef(true);
      if (first.current) firsts.push(meals?.map((m) => m.clientId));
      first.current = false;
      return <p>{meals ? `meals: ${meals.map((m) => m.clientId)}` : '…'}</p>;
    }
    const app = (tab: boolean, session = 1) =>
      withApp(
        <DataProvider key={session} user={user}>
          {tab ? <Day /> : <p>other tab</p>}
        </DataProvider>,
      );
    const { rerender } = render(app(true));
    expect(await screen.findByText('meals: a')).toBeTruthy();
    rerender(app(false));
    await screen.findByText('other tab');
    rerender(app(true));
    expect(firsts).toEqual([undefined, ['a']]);

    // A new database (a user switch opens one) does not show what the old one read.
    serve(page({ rev: 1 }));
    rerender(app(true, 2));
    expect(await screen.findByText('meals: a')).toBeTruthy();
    expect(firsts).toEqual([undefined, ['a'], undefined]);
  });
});

describe('useNorm', () => {
  it('moves with the birthday, with no request (E-1.2)', async () => {
    const user = { id: 7, email: 'a@example.com' } as MeResponse;
    const fetch = vi.fn(async () =>
      Response.json(page({ rev: 1, profile: { ...PROFILE, manual: null } })),
    );
    vi.stubGlobal('fetch', fetch);
    function Norm({ date }: { date: string }) {
      return <p>{`kcal: ${useNorm(date)?.kcal}`}</p>;
    }
    const app = (date: string) =>
      withApp(
        <DataProvider user={user}>
          <Norm date={date} />
        </DataProvider>,
      );
    const { rerender } = render(app('2025-12-31'));
    const before = await screen.findByText(/kcal: \d/);
    const age29 = before.textContent;
    // Start-up sends the pull and then /api/products/mine; a slow runner sends the second late.
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const calls = fetch.mock.calls.length;
    rerender(app('2026-01-01'));
    await waitFor(() => expect(before.textContent).not.toBe(age29));
    expect(fetch.mock.calls.length).toBe(calls);
  });
});

describe('network back (OCT-19 2.9)', () => {
  it('sends the queue and says how many entries went', async () => {
    const user = { id: 7, email: 'a@example.com' } as MeResponse;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    render(
      withApp(
        <DataProvider user={user}>
          <p>ready</p>
        </DataProvider>,
      ),
    );
    await screen.findByText('ready');
    await open();
    await patchSettings(db, { theme: 'dark' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('/api/sync')
          ? Response.json(page({}))
          : new Response(null, { status: 204 }),
      ),
    );
    act(() => void window.dispatchEvent(new Event('online')));
    expect(await screen.findByText('Synced 1 entry')).toBeTruthy();
  });
});

describe('time zone (ADR-0027 §4)', () => {
  const settings = {
    locale: 'en',
    theme: 'system',
    units: 'metric',
    settingsRev: 3,
    photoRetentionDays: null,
    normDisclaimerHidden: false,
    offEnabled: false,
    offHintAt: null,
  } as const;
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;

  /** Starts the provider with `saved` as the server's zone; returns the PATCH bodies sent. */
  const start = async (saved: string | null) => {
    const patches: unknown[] = [];
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        urls.push(url);
        if (url === '/api/account/settings' && init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as { timeZone: string };
          patches.push(body);
          return Response.json({ ...settings, timeZone: body.timeZone });
        }
        if (url.startsWith('/api/sync'))
          return Response.json(
            page({
              settings: {
                ...settings,
                timeZone: saved,
              } as SyncResponse['settings'],
            }),
          );
        throw new TypeError(`unexpected ${url}`);
      }),
    );
    render(
      withApp(
        <DataProvider user={{ id: 7, email: 'a@example.com' } as MeResponse}>
          <p>ready</p>
        </DataProvider>,
      ),
    );
    await open();
    // My products are fetched right after the zone is sent.
    await waitFor(() => expect(urls).toContain('/api/products/mine'));
    return patches;
  };

  it('sends the device zone once when the saved one differs', async () => {
    expect(await start('Pacific/Kiritimati')).toEqual([{ timeZone: here }]);
    expect(await db.get('kv', 'settings')).toMatchObject({ timeZone: here });
  });

  it('sends nothing when the zone is already saved', async () => {
    expect(await start(here)).toEqual([]);
  });
});
