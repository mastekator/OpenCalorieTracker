import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { z } from 'zod';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { api, ME_PATH } from '../api/client';
import { clearLocal, getLastUser } from '../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';
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
  normDisclaimerHidden: false,
  passwordFromConfig: false,
  methods: ['password'],
  enabledMethods: ['password', 'passkey'],
};

const config = {
  version: '0.1.0',
  apiVersion: 1,
  publicUrl: null,
  authMethods: ['password'],
  registration: 'invite',
  setupError: null,
};

const emptySync = { rev: 0, more: false, meals: [], deletedMealClientIds: [] };

/**
 * /api/config answers with `config`, /api/auth/me with `session` (null → 401), /api/sync with nothing new;
 * every other path answers 401. `offline` makes every request fail like a lost network.
 */
function serve(session: object | null, offline = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      if (offline) throw new TypeError('Failed to fetch');
      if (path === '/api/config') return Response.json(config);
      if (session && path === ME_PATH) return Response.json(session);
      if (session && path.startsWith('/api/sync'))
        return Response.json(emptySync);
      return Response.json(
        { error: { code: 'unauthenticated' } },
        { status: 401 },
      );
    }),
  );
}

function renderAt(url: string) {
  const [path, search = ''] = url.split('?');
  const location = memoryLocation({ path, searchPath: search, record: true });
  render(
    <I18nProvider>
      <Router hook={location.hook} searchHook={location.searchHook}>
        <SessionProvider>
          <Routes />
        </SessionProvider>
      </Router>
    </I18nProvider>,
  );
  return location;
}

const unauthorizedCall = () =>
  act(() => api('/api/diary', z.unknown()).catch(() => {}));

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await clearLocal(me.id);
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

  it('starts offline from the last user’s local copy without checking the session (E-8.10)', async () => {
    serve(me);
    renderAt('/week');
    await screen.findByRole('heading', { name: 'Week' });
    expect(getLastUser()).toEqual({ id: me.id, email: me.email });
    cleanup();

    serve(null, true);
    renderAt('/week');
    expect(await screen.findByRole('heading', { name: 'Week' })).toBeTruthy();
    expect(screen.getByText('anna@example.com')).toBeTruthy();
  });

  it('starts from the local copy when the server behind a proxy is down', async () => {
    serve(me);
    renderAt('/week');
    await screen.findByRole('heading', { name: 'Week' });
    cleanup();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Bad Gateway', { status: 502 })),
    );
    renderAt('/week');
    expect(await screen.findByRole('heading', { name: 'Week' })).toBeTruthy();
  });

  it('shows the no-connection screen offline when nobody has signed in here, with a retry', async () => {
    serve(null, true);
    renderAt('/week');
    expect(
      await screen.findByRole('heading', {
        name: 'Can’t reach the server. Check your connection',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Sign-in needs a connection')).toBeTruthy();

    serve(me);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Week' })).toBeTruthy();
  });
});
