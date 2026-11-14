import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { z } from 'zod';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { api, ME_PATH } from '../api/client';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';
import { ConfigProvider } from './ConfigContext';
import { Routes } from './routes';
import { SessionProvider } from './SessionContext';

const me = {
  id: 1,
  email: 'anna@example.com',
  name: null,
  role: 'user',
  locale: 'en',
  theme: 'system',
  units: 'metric',
  passwordFromConfig: false,
  methods: ['password'],
};

const config = {
  version: '0.1.0',
  apiVersion: 1,
  publicUrl: null,
  authMethods: ['password'],
  registration: 'invite',
  setupError: null,
};

/** /api/auth/me answers with `session` (null → 401); every other path but /api/config answers 401. */
function serve(session: object | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) =>
      path === '/api/config'
        ? Response.json(config)
        : path === ME_PATH && session
          ? Response.json(session)
          : Response.json(
              { error: { code: 'unauthenticated' } },
              { status: 401 },
            ),
    ),
  );
}

function renderAt(url: string) {
  const [path, search = ''] = url.split('?');
  const location = memoryLocation({ path, searchPath: search, record: true });
  render(
    <I18nProvider>
      <Router hook={location.hook} searchHook={location.searchHook}>
        <ConfigProvider>
          <SessionProvider>
            <Routes />
          </SessionProvider>
        </ConfigProvider>
      </Router>
    </I18nProvider>,
  );
  return location;
}

const unauthorizedCall = () =>
  act(() => api('/api/diary', z.unknown()).catch(() => {}));

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AuthGate', () => {
  it('sends a visitor without a session to sign-in with the path in next', async () => {
    serve(null);
    const location = renderAt('/diary?date=2026-11-14');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(location.history.at(-1)).toBe(
      '/login?next=%2Fdiary%3Fdate%3D2026-11-14',
    );
  });

  it('shows the app with tabs and the signed-in email', async () => {
    serve(me);
    renderAt('/week');
    expect(await screen.findByRole('heading', { name: 'Week' })).toBeTruthy();
    expect(screen.getByText('anna@example.com')).toBeTruthy();
    for (const link of screen.getAllByRole('link', { name: 'Week' }))
      expect(link.getAttribute('aria-current')).toBe('page');
  });

  it('sends the user to sign-in with expired=1 when a request gets 401 mid-session', async () => {
    serve(me);
    const location = renderAt('/profile');
    await screen.findByRole('heading', { name: 'Profile' });
    await unauthorizedCall();
    expect(location.history.at(-1)).toBe('/login?next=%2Fprofile&expired=1');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });

  it('does not redirect on 401 while already on a sign-in screen', async () => {
    serve(null);
    const location = renderAt('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    await unauthorizedCall();
    expect(location.history).toEqual(['/login']);
  });

  it('sends a signed-in user from sign-in on to next', async () => {
    serve(me);
    const location = renderAt('/login?next=%2Fweek');
    await screen.findByRole('heading', { name: 'Week' });
    expect(location.history.at(-1)).toBe('/week');
  });
});
