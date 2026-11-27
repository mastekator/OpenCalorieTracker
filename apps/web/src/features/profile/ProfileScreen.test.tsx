import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  calculateNorm,
  type MeResponse,
  type ProfileResponse,
} from '@oct/shared';
import { SessionContext } from '../../app/SessionContext';
import { DataProvider, useAiStatus } from '../../data/DataContext';
import { setDeviceAi } from '../../data/deviceAi';
import { openUserDb } from '../../data/db';
import { clearLocal } from '../../data/user';
import { localToday } from '../diary/day';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { ProfileScreen } from './ProfileScreen';

const USER = { id: 7, units: 'metric' } as MeResponse;
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
  manual: null,
  rev: 3,
};

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await clearLocal(USER.id);
});

describe('ProfileScreen offline (8.15)', () => {
  it('shows the synced profile read-only, without the network', async () => {
    const db = await openUserDb(USER.id);
    await db.put('kv', PROFILE, 'profile');
    await db.put('kv', 3, 'rev');
    db.close();
    render(
      <I18nProvider>
        <ToastProvider>
          <SessionContext
            value={{
              user: USER,
              refresh: async () => {},
              signedIn: async () => {},
              logout: async () => {},
            }}
          >
            <DataProvider user={USER}>
              <ProfileScreen />
            </DataProvider>
          </SessionContext>
        </ToastProvider>
      </I18nProvider>,
    );

    const height = await screen.findByDisplayValue('180');
    // Disabled through the form's fieldset, so `.disabled` stays false.
    expect(height.matches(':disabled')).toBe(true);
    expect(
      screen
        .getByRole('switch', { name: 'Set my own goal' })
        .matches(':disabled'),
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    const agent = screen.getByRole('button', {
      name: 'Recalculate with the assistant',
    }) as HTMLButtonElement;
    expect(agent.disabled).toBe(true);
    expect(
      screen.getByText('The goal assistant needs a connection'),
    ).toBeTruthy();
    // The weight screen works offline: its row is a link, past the disabled fieldset.
    expect(
      screen.getByRole('link', { name: /^Weight/ }).matches(':disabled'),
    ).toBe(false);
    // «How it’s calculated» still opens.
    expect(screen.getByRole('button', { name: /How/ })).toBeTruthy();
    expect(fetch).not.toHaveBeenCalledWith('/api/profile', expect.anything());
  });
});

describe('ProfileScreen, AI configured but not answering (8.14)', () => {
  it('«Recalculate with the assistant» shows a banner instead of the chat', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/ai/status'
          ? Response.json({
              recognition: 'ready',
              interview: 'unavailable',
              providerName: 'x',
              baseUrlHost: null,
              refineLimit: null,
              userKeysDisabledNotice: false,
            })
          : Promise.reject(new TypeError('no server in this test')),
      ),
    );
    const db = await openUserDb(USER.id);
    await db.put('kv', PROFILE, 'profile');
    await db.put('kv', 3, 'rev');
    db.close();
    render(
      <I18nProvider>
        <ToastProvider>
          <SessionContext
            value={{
              user: USER,
              refresh: async () => {},
              signedIn: async () => {},
              logout: async () => {},
            }}
          >
            <DataProvider user={USER}>
              <ProfileScreen />
            </DataProvider>
          </SessionContext>
        </ToastProvider>
      </I18nProvider>,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Recalculate with the assistant',
      }),
    );
    expect(
      await screen.findByText('The AI isn’t available right now'),
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: 'Goal assistant' }),
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalledWith(
      '/api/norm-agent',
      expect.anything(),
    );

    // «+» on the weight row opens the weigh-in sheet (OCT-189 §4).
    fireEvent.click(screen.getByRole('button', { name: 'Log weight' }));
    expect(
      await screen.findByRole('dialog', { name: 'Log weight' }),
    ).toBeTruthy();
  });
});

describe('ProfileScreen, AI status refreshing (OCT-448)', () => {
  it('shows the profile with the stored status, not waiting for the network', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    // The status request never answers.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    const db = await openUserDb(USER.id);
    await db.put('kv', PROFILE, 'profile');
    await db.put('kv', 3, 'rev');
    await db.put(
      'kv',
      {
        recognition: 'ready',
        interview: 'ready',
        providerName: 'x',
        baseUrlHost: null,
        refineLimit: null,
        userKeysDisabledNotice: false,
      },
      'aiStatus',
    );
    db.close();
    render(
      <I18nProvider>
        <ToastProvider>
          <SessionContext
            value={{
              user: USER,
              refresh: async () => {},
              signedIn: async () => {},
              logout: async () => {},
            }}
          >
            <DataProvider user={USER}>
              <ProfileScreen />
            </DataProvider>
          </SessionContext>
        </ToastProvider>
      </I18nProvider>,
    );

    expect(await screen.findByDisplayValue('180')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith('/api/ai/status', expect.anything());
  });
});

describe('AI off on this device (ADR-0031 §6)', () => {
  /** What every recognition-gated way in reads: refine, recalc, kitchen, label photos. */
  function Recognition() {
    const { status } = useAiStatus();
    return <output>{`recognition: ${status?.recognition}`}</output>;
  }

  it.each([true, false])(
    'online %s: no assistant, every AI way in reads «not configured», no status request',
    async (online) => {
      setDeviceAi(USER.id, false);
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
      vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise(() => {})),
      );
      const db = await openUserDb(USER.id);
      await db.put('kv', PROFILE, 'profile');
      await db.put('kv', 3, 'rev');
      await db.put(
        'kv',
        {
          recognition: 'ready',
          interview: 'ready',
          providerName: 'x',
          baseUrlHost: null,
          refineLimit: null,
          userKeysDisabledNotice: false,
        },
        'aiStatus',
      );
      db.close();
      render(
        <I18nProvider>
          <ToastProvider>
            <SessionContext
              value={{
                user: USER,
                refresh: async () => {},
                signedIn: async () => {},
                logout: async () => {},
              }}
            >
              <DataProvider user={USER}>
                <ProfileScreen />
                <Recognition />
              </DataProvider>
            </SessionContext>
          </ToastProvider>
        </I18nProvider>,
      );

      expect(await screen.findByDisplayValue('180')).toBeTruthy();
      expect(
        await screen.findByText('recognition: not_configured'),
      ).toBeTruthy();
      expect(screen.queryByRole('button', { name: /assistant/ })).toBeNull();
      expect(fetch).not.toHaveBeenCalledWith(
        '/api/ai/status',
        expect.anything(),
      );
      setDeviceAi(USER.id, true);
    },
  );
});

describe('ProfileScreen, goal applied in the chat (OCT-225)', () => {
  it('brings today’s weighing into the local copy at once', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const today = localToday();
    const draft = { ...PROFILE.profile, weightKg: 78 };
    const norm = calculateNorm(draft, today);
    let applied = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/ai/status')
          return Response.json({
            recognition: 'ready',
            interview: 'ready',
            providerName: 'x',
            baseUrlHost: null,
            refineLimit: null,
            userKeysDisabledNotice: false,
          });
        if (url === '/api/norm-agent')
          return Response.json({
            messages: [{ role: 'assistant', kind: 'summary', draft, norm }],
            state: 'summary',
            draft: { profile: draft, unknown: [], paceWarned: null },
            userTurns: 1,
          });
        if (url === '/api/norm-agent/apply' && init?.method === 'POST') {
          applied = true;
          return Response.json({ ...PROFILE, profile: draft, rev: 4 });
        }
        if (url.startsWith('/api/sync'))
          // The server wrote today's weighing with the applied profile (AC-9.10).
          return Response.json({
            rev: applied ? 4 : 3,
            more: false,
            meals: [],
            deletedMealClientIds: [],
            weighings: applied ? [{ date: today, weightKg: 78 }] : [],
          });
        throw new TypeError(`no ${url} in this test`);
      }),
    );
    const db = await openUserDb(USER.id);
    await db.put('kv', PROFILE, 'profile');
    await db.put('kv', 3, 'rev');
    await db.put('weighings', { date: '2026-01-01', weightKg: 80 });
    render(
      <I18nProvider>
        <ToastProvider>
          <SessionContext
            value={{
              user: USER,
              refresh: async () => {},
              signedIn: async () => {},
              logout: async () => {},
            }}
          >
            <DataProvider user={USER}>
              <ProfileScreen />
            </DataProvider>
          </SessionContext>
        </ToastProvider>
      </I18nProvider>,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Recalculate with the assistant',
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Apply goal' }));
    await waitFor(async () =>
      expect(await db.get('weighings', today)).toEqual({
        date: today,
        weightKg: 78,
      }),
    );
    db.close();
  });
});
