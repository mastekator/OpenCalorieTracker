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
import { openUserDb } from '../data/db';
import { clearLocal, getLastUser, pendingOf, setLastUser } from '../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';
import { Routes } from './routes';
import { SessionProvider, SIGNED_OUT_KEY, useSession } from './SessionContext';

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
  await clearLocal(bob.id);
});

const bob = { id: 2, email: 'bob@example.com' };

/** `user` was the last one here and left `count` unsent changes. */
async function queuedFor(user: { id: number; email: string }, count: number) {
  setLastUser(user);
  const db = await openUserDb(user.id);
  for (let i = 0; i < count; i++)
    await db.add('outbox', {
      kind: 'deleteMeal',
      clientId: `c${i}`,
      id: i,
    } as never);
  db.close();
}

const dbNames = async () => (await indexedDB.databases()).map((d) => d.name);

describe('another account on this device (3.8)', () => {
  it('asks first and keeps the previous user’s base until then', async () => {
    await queuedFor(bob, 2);
    serve(me);
    renderAt('/login');
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Sign in with another account?',
    });
    expect(dialog.textContent).toContain(
      "2 entries from bob@example.com haven't been sent yet.",
    );
    expect(getLastUser()).toEqual(bob);
    expect(await dbNames()).not.toContain(`oct-${me.id}`);
    expect(await pendingOf(bob.id)).toBe(2);
  });

  it('«Sign in» removes the previous user’s base and opens the app', async () => {
    await queuedFor(bob, 1);
    serve(me);
    renderAt('/login?next=%2Fweek');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Week' })).toBeTruthy();
    expect(await dbNames()).not.toContain(`oct-${bob.id}`);
    expect(getLastUser()).toEqual({ id: me.id, email: me.email });
  });

  it('«Cancel» signs out and keeps the previous user’s base', async () => {
    await queuedFor(bob, 1);
    serve(me);
    renderAt('/login');
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.anything()),
    );
    expect(
      await screen.findByRole('heading', { name: 'Sign in' }),
    ).toBeTruthy();
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).toBeNull(),
    );
    expect(getLastUser()).toEqual(bob);
    expect(await pendingOf(bob.id)).toBe(1);
  });

  it('removes the previous user’s base without asking when nothing is queued', async () => {
    await queuedFor(bob, 0);
    serve(me);
    renderAt('/week');
    await screen.findByRole('heading', { name: 'Week' });
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).toBeNull(),
    );
    expect(await dbNames()).not.toContain(`oct-${bob.id}`);
  });
});

describe('session expired with a queue (3.7)', () => {
  it('names the unsent changes of the last user under the banner', async () => {
    await queuedFor({ id: me.id, email: me.email }, 3);
    serve(null);
    renderAt('/login?next=%2Fweek&expired=1');
    expect(
      await screen.findByText(
        "3 offline entries are saved — we'll send them after you sign in.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Your session expired. Please sign in again'),
    ).toBeTruthy();
  });
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
    // /week itself opens the current week.
    expect(location.history.at(-1)).toMatch(/^\/week\/\d{4}-W\d{2}$/);
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

  it('keeps /meal/new on the new-meal flow, other ids look up the meal', async () => {
    serve(me);
    let location = renderAt('/meal/new');
    // No photo: manual entry on the edit screen, not a meal with clientId «new».
    await screen.findByRole('button', { name: 'Save' });
    expect(location.history.at(-1)).toBe('/meal/new/edit');
    cleanup();

    // Not in the local copy: Today.
    location = renderAt('/meal/abc');
    await vi.waitFor(() => expect(location.history).toEqual(['/']));
  });

  it('shows 3.4 offline when nobody has signed in here, with a retry', async () => {
    serve(null, true);
    renderAt('/week');
    expect(
      await screen.findByRole('heading', {
        name: 'First sign-in needs a connection',
      }),
    ).toBeTruthy();

    serve(me);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Week' })).toBeTruthy();
  });

  it('3.4 updates by itself when the network comes back', async () => {
    serve(null, true);
    renderAt('/login');
    await screen.findByRole('heading', {
      name: 'First sign-in needs a connection',
    });
    serve(null);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(
      await screen.findByRole('heading', { name: 'Sign in' }),
    ).toBeTruthy();
  });

  it('opens /login offline from the local copy without the config', async () => {
    serve(me);
    renderAt('/week');
    await screen.findByRole('heading', { name: 'Week' });
    cleanup();

    serve(null, true);
    const location = renderAt('/login?next=%2Fdiary');
    expect(await screen.findByRole('heading', { name: 'Diary' })).toBeTruthy();
    expect(location.history.at(-1)).toMatch(/^\/diary\/\d{4}-\d{2}-\d{2}$/);
  });
});

describe('sign-out (4.6) and the offline flag', () => {
  /** /api/auth/logout answers 204 unless offline; `me` until it is called. */
  function serveLogout(offline = () => false) {
    let session = true;
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? 'GET'} ${path}`);
        if (offline()) throw new TypeError('Failed to fetch');
        if (path === '/api/config') return Response.json(config);
        if (path === '/api/auth/logout') {
          session = false;
          return new Response(null, { status: 204 });
        }
        if (session && path === ME_PATH) return Response.json(me);
        if (session && path.startsWith('/api/sync'))
          return Response.json(emptySync);
        return Response.json(
          { error: { code: 'unauthenticated' } },
          { status: 401 },
        );
      }),
    );
    return calls;
  }

  function SignOut() {
    const { logout, signedIn } = useSession();
    return (
      <>
        <button onClick={() => void logout()}>out</button>
        <button onClick={() => void signedIn()}>in</button>
      </>
    );
  }

  function renderSignOut() {
    const location = memoryLocation({ path: '/settings', record: true });
    render(
      <I18nProvider>
        <Router hook={location.hook}>
          <SessionProvider>
            <SignOut />
          </SessionProvider>
        </Router>
      </I18nProvider>,
    );
    return location;
  }

  afterEach(() => localStorage.removeItem(SIGNED_OUT_KEY));

  it('ends the session, deletes the local base and goes to sign-in', async () => {
    const calls = serveLogout();
    setLastUser(me);
    (await openUserDb(me.id)).close();
    const location = renderSignOut();
    fireEvent.click(await screen.findByRole('button', { name: 'out' }));
    await vi.waitFor(() => expect(location.history.at(-1)).toBe('/login'));
    expect(calls).toContain('POST /api/auth/logout');
    expect(await dbNames()).not.toContain(`oct-${me.id}`);
    expect(getLastUser()).toBeNull();
    expect(localStorage.getItem(SIGNED_OUT_KEY)).toBeNull();
  });

  it('from an invite link: deletes the local base and stays on the link (2.5)', async () => {
    const calls = serveLogout();
    setLastUser(me);
    (await openUserDb(me.id)).close();
    const location = renderAt('/invite');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Sign out and continue' }),
    );
    await vi.waitFor(() => expect(getLastUser()).toBeNull());
    expect(calls).toContain('POST /api/auth/logout');
    expect(await dbNames()).not.toContain(`oct-${me.id}`);
    expect(location.history.at(-1)).toBe('/invite');
  });

  it('from an invite link with unsent entries: warns first, «Cancel» keeps them', async () => {
    const calls = serveLogout();
    await queuedFor(me, 1);
    renderAt('/invite');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Sign out and continue' }),
    );
    // The send fails (401 here), so the entry is still unsent.
    await screen.findByRole('alertdialog', { name: 'Sign out?' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(calls).not.toContain('POST /api/auth/logout');
    expect(await pendingOf(me.id)).toBe(1);

    fireEvent.click(
      screen.getByRole('button', { name: 'Sign out and continue' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Sign out and delete entries',
      }),
    );
    await vi.waitFor(() => expect(getLastUser()).toBeNull());
    expect(await dbNames()).not.toContain(`oct-${me.id}`);
  });

  it('offline: signs out here and ends the session on the next start', async () => {
    let offline = false;
    const calls = serveLogout(() => offline);
    setLastUser(me);
    const location = renderSignOut();
    const out = await screen.findByRole('button', { name: 'out' });
    offline = true;
    fireEvent.click(out);
    await vi.waitFor(() => expect(location.history.at(-1)).toBe('/login'));
    expect(localStorage.getItem(SIGNED_OUT_KEY)).toBe('1');
    expect(await dbNames()).not.toContain(`oct-${me.id}`);
    cleanup();

    // Still offline: no local copy opens, the flag stays.
    renderAt('/');
    expect(
      await screen.findByRole('heading', {
        name: 'First sign-in needs a connection',
      }),
    ).toBeTruthy();
    expect(localStorage.getItem(SIGNED_OUT_KEY)).toBe('1');
    cleanup();

    offline = false;
    calls.length = 0;
    renderAt('/');
    await vi.waitFor(() =>
      expect(localStorage.getItem(SIGNED_OUT_KEY)).toBeNull(),
    );
    expect(calls.slice(0, 2)).toEqual([
      'POST /api/auth/logout',
      `GET ${ME_PATH}`,
    ]);
  });

  it('a sign-in drops the flag, so the new session is not ended', async () => {
    const calls = serveLogout();
    renderSignOut();
    const signIn = await screen.findByRole('button', { name: 'in' });
    localStorage.setItem(SIGNED_OUT_KEY, '1');
    calls.length = 0;
    fireEvent.click(signIn);
    await vi.waitFor(() => expect(calls).toContain(`GET ${ME_PATH}`));
    expect(calls).not.toContain('POST /api/auth/logout');
    expect(localStorage.getItem(SIGNED_OUT_KEY)).toBeNull();
  });
});
