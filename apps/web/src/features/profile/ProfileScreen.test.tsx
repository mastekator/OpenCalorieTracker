import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MeResponse, ProfileResponse } from '@oct/shared';
import { SessionContext } from '../../app/SessionContext';
import { DataProvider } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { clearLocal } from '../../data/user';
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
      name: 'Set up with the assistant',
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
  it('«Set up with the assistant» shows a banner instead of the chat', async () => {
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
      await screen.findByRole('button', { name: 'Set up with the assistant' }),
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
