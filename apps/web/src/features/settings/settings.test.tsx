import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import type {
  AccountSettings,
  AiStatus,
  Meal,
  MeResponse,
  Passkey,
} from '@oct/shared';
import { listenInstallPrompt } from '../../app/install';
import { DESKTOP_MEDIA } from '../../styles/breakpoints';
import { THEME_STORAGE_KEY } from '../../app/theme';
import { emitChange } from '../../data/changes';
import { DataProvider } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { setDeviceAi } from '../../data/deviceAi';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { isLastMethod } from './methods';
import { PasskeySheet, PasskeysScreen } from './PasskeysScreen';
import { PasswordScreen } from './PasswordScreen';
import { hintClosedKey, SettingsScreen } from './SettingsScreen';

const user: MeResponse = {
  id: 2,
  email: 'anna@example.com',
  name: null,
  role: 'user',
  locale: 'en',
  theme: 'system',
  units: 'metric',
  normDisclaimerHidden: false,
  passwordFromConfig: false,
  methods: ['passkey'],
  enabledMethods: ['password', 'passkey'],
};
const admin: MeResponse = {
  ...user,
  id: 1,
  role: 'admin',
  passwordFromConfig: true,
  methods: ['password'],
};
const passkey: Passkey = {
  id: 7,
  name: 'iPhone · Safari',
  createdAt: Date.UTC(2026, 10, 1),
  lastUsedAt: null,
  thisDevice: true,
};

/** Renders once the dictionary has loaded; `data`: inside DataProvider, as SettingsScreen needs. */
async function wrap(node: ReactNode, data = false) {
  const view = render(
    <I18nProvider>
      <ToastProvider>
        {data ? (
          <DataProvider user={user}>
            <div data-testid="ready">{node}</div>
          </DataProvider>
        ) : (
          <div data-testid="ready">{node}</div>
        )}
      </ToastProvider>
    </I18nProvider>,
  );
  await screen.findByTestId('ready');
  return view;
}

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(async () => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await clearLocal(user.id);
});

describe('SettingsScreen', () => {
  it('hides the admin group from a regular user', async () => {
    await wrap(<SettingsScreen user={user} onLogout={async () => {}} />, true);
    expect(screen.queryByRole('heading', { name: 'Admin' })).toBeNull();
    expect(screen.queryByText('Invites')).toBeNull();
    expect(screen.getByText('Sign-in · anna@example.com')).toBeTruthy();
    expect(screen.getByText('Set password')).toBeTruthy();
  });

  it('shows the admin group to an admin, disabled offline with a toast', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    await wrap(<SettingsScreen user={admin} onLogout={async () => {}} />, true);
    expect(screen.getByRole('heading', { name: 'Admin' })).toBeTruthy();
    const invites = screen.getByRole('button', { name: 'Invites' });
    expect(invites.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(invites);
    expect(
      screen.getByText('Admin tools need an internet connection.'),
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText('Admin settings need a connection')).toBeTruthy(),
    );
    const password = screen
      .getByText('Change password', { selector: '.list-row__label' })
      .closest('button')!;
    expect(password.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(password);
    await waitFor(() =>
      expect(
        screen.getByText('Passkeys and password can only be changed online'),
      ).toBeTruthy(),
    );
  });

  it('shows only enabled sign-in methods', async () => {
    await wrap(
      <SettingsScreen
        user={{ ...user, enabledMethods: ['passkey'] }}
        onLogout={async () => {}}
      />,
      true,
    );
    expect(screen.getByText('My passkeys')).toBeTruthy();
    expect(screen.queryByText('Set password')).toBeNull();
  });

  it('shows the admin a closable hint while the config password is in use (AC-1.7)', async () => {
    await wrap(<SettingsScreen user={admin} onLogout={async () => {}} />, true);
    expect(
      screen.getByText('Change the password set during installation'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(
      screen.queryByText('Change the password set during installation'),
    ).toBeNull();
    expect(localStorage.getItem(hintClosedKey(admin.id))).toBe('1');
  });
});

describe('last sign-in method (AC-6.2)', () => {
  it('counts only enabled methods, like the server', () => {
    expect(isLastMethod(user, 1)).toBe(true);
    expect(isLastMethod(user, 2)).toBe(false);
    const both = { ...user, methods: ['password', 'passkey'] } as MeResponse;
    expect(isLastMethod(both, 1)).toBe(false);
    expect(isLastMethod({ ...both, enabledMethods: ['passkey'] }, 1)).toBe(
      true,
    );
  });

  it('does not offer deleting the last passkey and says why', async () => {
    await wrap(
      <PasskeySheet
        passkey={passkey}
        last
        onClose={() => {}}
        onDone={async () => {}}
      />,
    );
    // The sheet opens (showModal) in an effect after the commit; wait for it.
    const del = await screen.findByRole('button', { name: 'Delete passkey' });
    expect((del as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('This is your only way to sign in')).toBeTruthy();
  });

  it('offers deleting a passkey that is not the last', async () => {
    await wrap(
      <PasskeySheet
        passkey={passkey}
        last={false}
        onClose={() => {}}
        onDone={async () => {}}
      />,
    );
    // The sheet opens (showModal) in an effect after the commit; wait for it.
    const del = await screen.findByRole('button', { name: 'Delete passkey' });
    expect((del as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('This is your only way to sign in')).toBeNull();
  });
});

describe('PasskeysScreen', () => {
  it('lists passkeys with the «this device» badge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          passkey,
          {
            ...passkey,
            id: 8,
            name: 'Mac · Chrome',
            lastUsedAt: Date.UTC(2026, 10, 10),
            thisDevice: false,
          },
        ]),
      ),
    );
    await wrap(<PasskeysScreen user={user} onChanged={async () => {}} />);
    expect(await screen.findByText('Mac · Chrome')).toBeTruthy();
    expect(screen.getAllByText('this device')).toHaveLength(1);
    expect(screen.getByText(/not used yet/)).toBeTruthy();
  });
});

describe('PasswordScreen', () => {
  it('sets a first password without the current one', async () => {
    await wrap(<PasswordScreen user={user} onDone={async () => {}} />);
    expect(screen.queryByLabelText('Current password')).toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: 'Set password',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('shows a wrong current password under its field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: 'invalid_credentials' } },
          { status: 400 },
        ),
      ),
    );
    await wrap(<PasswordScreen user={admin} onDone={async () => {}} />);
    const type = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    type('Current password', 'wrong-one-1!');
    type('New password', 'Brand-new-pass-42');
    type('Repeat new password', 'Brand-new-pass-42');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() =>
      expect(screen.getByText('Incorrect password')).toBeTruthy(),
    );
  });

  it('catches a mismatched repeat before sending', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await wrap(<PasswordScreen user={user} onDone={async () => {}} />);
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'Brand-new-pass-42' },
    });
    fireEvent.change(screen.getByLabelText('Repeat new password'), {
      target: { value: 'Brand-new-pass-43' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(screen.getByText('Passwords don’t match')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
});

const synced: AccountSettings = {
  locale: 'en',
  theme: 'system',
  units: 'metric',
  settingsRev: 1,
  photoRetentionDays: 30,
  normDisclaimerHidden: false,
  offEnabled: false,
  offHintAt: null,
};
const seed = async (settings: AccountSettings, ai?: AiStatus) => {
  const db = await openUserDb(user.id);
  await db.put('kv', settings, 'settings');
  await db.put('kv', 1, 'rev');
  if (ai) await db.put('kv', ai, 'aiStatus');
  db.close();
};
const outbox = async () => {
  const db = await openUserDb(user.id);
  const ops = await db.getAll('outbox');
  db.close();
  return ops;
};
const offlineNow = () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
};
const serve = (body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(body)),
  );
const screenOf = (u = user) => (
  <SettingsScreen user={u} onLogout={async () => {}} platform={null} />
);

describe('Appearance and data (OCT-25 §4)', () => {
  it('language, theme and units apply without a reload and go to the queue', async () => {
    offlineNow();
    await seed(synced);
    await wrap(screenOf(), true);

    fireEvent.click(await screen.findByRole('radio', { name: 'Русский' }));
    expect(await screen.findByText('Внешний вид')).toBeTruthy();
    expect(document.documentElement.lang).toBe('ru');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ru');

    fireEvent.click(screen.getByRole('radio', { name: 'Тёмная' }));
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('dark'),
    );
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    fireEvent.click(screen.getByRole('radio', { name: 'США' }));
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: 'США' }).getAttribute('aria-checked'),
      ).toBe('true'),
    );
    const ops = await outbox();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      kind: 'patchSettings',
      body: { locale: 'ru', theme: 'dark', units: 'us' },
    });

    // Back to the system theme: no attribute, no saved key.
    fireEvent.click(screen.getByRole('radio', { name: 'Системная' }));
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBeUndefined(),
    );
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('settings synced from another device apply here and are not queued back', async () => {
    offlineNow();
    await seed(synced);
    await wrap(screenOf(), true);
    await screen.findByRole('radio', { name: 'English' });

    await seed({ ...synced, locale: 'ru', theme: 'dark' });
    emitChange();
    expect(await screen.findByText('Внешний вид')).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(await outbox()).toEqual([]);
  });
});

describe('Water and drinks switch (ADR-0028 §5)', () => {
  it('is off by default, unavailable offline', async () => {
    offlineNow();
    await seed(synced);
    await wrap(screenOf(), true);
    const sw = await screen.findByRole('switch', { name: 'Water and drinks' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect((sw as HTMLButtonElement).disabled).toBe(true);
  });

  it('online, turning it on sends the setting', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    serve({});
    await seed(synced);
    await wrap(screenOf(), true);
    fireEvent.click(
      await screen.findByRole('switch', { name: 'Water and drinks' }),
    );
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.find(
            ([url, init]) =>
              url === '/api/account/settings' && init?.method === 'PATCH',
          )?.[1]?.body,
      ).toMatch(/^\{"waterEnabled":true,/),
    );
    expect(
      screen
        .getByRole('switch', { name: 'Water and drinks' })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });
});

describe('Streaks and awards switch (ADR-0032 §5)', () => {
  it('on by default, turning it off works offline and goes to the queue', async () => {
    offlineNow();
    await seed(synced);
    await wrap(screenOf(), true);
    const sw = await screen.findByRole('switch', {
      name: 'Streaks and awards',
    });
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(sw);
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('false'));
    expect(await outbox()).toEqual([
      expect.objectContaining({
        kind: 'patchSettings',
        body: expect.objectContaining({ streaksEnabled: false }),
      }),
    ]);
    expect(screen.getByText(/Turn it on and the whole history/)).toBeTruthy();
  });
});

describe('Offline (4.8)', () => {
  it('banner, local rows active, sign-in and admin rows not, last AI status shown', async () => {
    offlineNow();
    await seed(synced, {
      recognition: 'ready',
      interview: 'ready',
      providerName: 'Google Gemini',
      baseUrlHost: null,
      refineLimit: null,
      userKeysDisabledNotice: false,
      serverAdminOnly: false,
    });
    await wrap(
      screenOf({ ...admin, id: user.id, passwordFromConfig: false }),
      true,
    );

    expect(
      await screen.findByText(/Everything works offline except sign-in/),
    ).toBeTruthy();
    expect(
      await screen.findByText('Through the server · Google Gemini'),
    ).toBeTruthy();
    for (const name of ['English', 'Dark', 'US'])
      expect(
        screen.getByRole('radio', { name }).getAttribute('aria-disabled'),
      ).toBeNull();
    for (const name of [/passkey/i, 'Change password', 'Users'])
      expect(
        screen.getByRole('button', { name }).getAttribute('aria-disabled'),
      ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: 'Sign out' })
        .getAttribute('aria-disabled'),
    ).toBeNull();
  });

  it('online, before /api/ai/status answers: the last known status; none saved: no row', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    await seed(synced, {
      recognition: 'ready',
      interview: 'ready',
      providerName: 'Google Gemini',
      baseUrlHost: null,
      refineLimit: null,
      userKeysDisabledNotice: false,
      serverAdminOnly: false,
    });
    await wrap(screenOf(), true);
    expect(
      await screen.findByText('Through the server · Google Gemini'),
    ).toBeTruthy();
    cleanup();
    await clearLocal(user.id);
    await seed(synced);
    await wrap(screenOf(), true);
    await screen.findByRole('radio', { name: 'English' });
    expect(screen.getByRole('button', { name: 'AI' })).toBeTruthy();
  });

  it('AI off on this device: the row says so and opens Settings → AI', async () => {
    offlineNow();
    setDeviceAi(user.id, false);
    await wrap(screenOf(), true);
    fireEvent.click(
      await screen.findByRole('button', { name: /^AI\s*Off on this device/ }),
    );
    expect(location.pathname).toBe('/settings/ai');
    history.replaceState(null, '', '/');
  });

  it('no AI: the manual-entry line; own server: its host', async () => {
    serve({
      recognition: 'not_configured',
      interview: 'not_configured',
      providerName: null,
      baseUrlHost: null,
      refineLimit: null,
      userKeysDisabledNotice: false,
      serverAdminOnly: false,
    });
    await wrap(screenOf(), true);
    expect(
      await screen.findByText('AI isn’t set up — manual entry is available'),
    ).toBeTruthy();
    cleanup();
    await clearLocal(user.id);
    serve({
      recognition: 'ready',
      interview: 'ready',
      providerName: null,
      baseUrlHost: '192.168.1.20:11434',
      refineLimit: null,
      userKeysDisabledNotice: false,
      serverAdminOnly: false,
    });
    await wrap(screenOf(), true);
    expect(
      await screen.findByText('Through the server · 192.168.1.20:11434'),
    ).toBeTruthy();
  });

  it('the install row opens the iPhone sheet', async () => {
    offlineNow();
    await wrap(
      <SettingsScreen
        user={user}
        onLogout={async () => {}}
        platform="safari"
      />,
      true,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add to Home Screen' }),
    );
    expect(await screen.findByText('Install on iPhone')).toBeTruthy();
  });
});

const DAY = 86_400_000;
/** A meal with a full photo eaten `ago` days back. */
const photoMeal = (clientId: string, ago: number) =>
  ({
    clientId,
    eatenAt: new Date(Date.now() - ago * DAY).toISOString(),
    photo: { id: clientId, full: true },
  }) as Meal;

describe('Keep meal photos (OCT-25 §4)', () => {
  it('a shorter period that deletes photos asks with their number, then queues', async () => {
    offlineNow();
    await seed(synced);
    const db = await openUserDb(user.id);
    for (const m of [photoMeal('a', 2), photoMeal('b', 10), photoMeal('c', 20)])
      await db.put('meals', m);
    db.close();
    await wrap(screenOf(), true);

    fireEvent.click(
      await screen.findByRole('button', { name: /Keep meal photos/ }),
    );
    fireEvent.click(await screen.findByRole('radio', { name: '7 days' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Keep photos for 7 days?',
    });
    expect(dialog.textContent).toContain(
      '2 photos older than 7 days will be deleted now.',
    );
    expect(await outbox()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete photos' }));
    await waitFor(async () =>
      expect(await outbox()).toMatchObject([
        { kind: 'putPhotoRetention', body: { days: 7 } },
      ]),
    );
    expect(
      (await screen.findByRole('button', { name: /Keep meal photos/ }))
        .textContent,
    ).toContain('7 days');
  });

  it('no alert when nothing would be deleted or the period grows', async () => {
    offlineNow();
    await seed(synced);
    const db = await openUserDb(user.id);
    await db.put('meals', photoMeal('a', 2));
    db.close();
    await wrap(screenOf(), true);

    const row = await screen.findByRole('button', { name: /Keep meal photos/ });
    fireEvent.click(row);
    fireEvent.click(await screen.findByRole('radio', { name: '7 days' }));
    await waitFor(async () =>
      expect(await outbox()).toMatchObject([{ body: { days: 7 } }]),
    );
    fireEvent.click(row);
    fireEvent.click(await screen.findByRole('radio', { name: 'Forever' }));
    await waitFor(async () =>
      expect(await outbox()).toMatchObject([{ body: { days: null } }]),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('Sign out (4.6, 4.7)', () => {
  const queueOne = async () => {
    const db = await openUserDb(user.id);
    await db.add('outbox', {
      kind: 'patchSettings',
      clientId: 'settings',
      body: { theme: 'dark', editedAt: 1 },
    });
    db.close();
  };

  it('empty queue: the plain confirm, then onLogout', async () => {
    offlineNow();
    await seed(synced);
    const onLogout = vi.fn(async () => {});
    await wrap(
      <SettingsScreen user={user} onLogout={onLogout} platform={null} />,
      true,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Sign out?',
    });
    expect(dialog.textContent).toContain('Your diary stays on the server.');
    expect(onLogout).not.toHaveBeenCalled();
    fireEvent.click(
      Array.from(dialog.querySelectorAll('button')).find(
        (b) => b.textContent === 'Sign out',
      )!,
    );
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('offline with a queue: names the unsent entries', async () => {
    offlineNow();
    await seed(synced);
    await queueOne();
    const onLogout = vi.fn(async () => {});
    await wrap(
      <SettingsScreen user={user} onLogout={onLogout} platform={null} />,
      true,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Sign out?',
    });
    expect(dialog.textContent).toContain('1 entry hasn’t been sent');
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign out and delete entries' }),
    );
    expect(onLogout).toHaveBeenCalledOnce();
  });

  const conflictOne = async (unsentToo: boolean) => {
    const db = await openUserDb(user.id);
    await db.add('outbox', {
      kind: 'patchMeal',
      clientId: 'meal-a',
      id: 5,
      body: { mealType: 'dinner', editedAt: 1, baseRev: 1 },
      conflict: { kind: 'deleted', deletedAt: 0 },
    });
    db.close();
    if (unsentToo) await queueOne();
  };

  it('a version not chosen is not unsent: the conflict text (4.6), plain sign out', async () => {
    offlineNow();
    await seed(synced);
    await conflictOne(false);
    await wrap(screenOf(), true);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Sign out?',
    });
    expect(dialog.textContent).toContain(
      '1 entry has no version chosen. If you sign out, the version from the other device will be kept.',
    );
    expect(dialog.textContent).not.toContain('hasn’t been sent');
    expect(
      screen.queryByRole('button', { name: 'Sign out and delete entries' }),
    ).toBeNull();
  });

  it('a conflict and an unsent entry: the unsent text, the version one second (4.7)', async () => {
    offlineNow();
    await seed(synced);
    await conflictOne(true);
    await wrap(screenOf(), true);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Sign out?',
    });
    expect(dialog.textContent).toMatch(
      /1 entry hasn’t been sent.* 1 entry has no version chosen/,
    );
    screen.getByRole('button', { name: 'Sign out and delete entries' });
  });

  it('online: the queue goes out first, then the plain confirm', async () => {
    await seed(synced);
    await queueOne();
    const fetch = vi.fn(async (url: string) =>
      url.startsWith('/api/sync')
        ? Response.json({
            rev: 1,
            more: false,
            meals: [],
            deletedMealClientIds: [],
          })
        : Response.json({}),
    );
    vi.stubGlobal('fetch', fetch);
    await wrap(screenOf(), true);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Sign out?',
    });
    expect(dialog.textContent).toContain('Your diary stays on the server.');
    expect(fetch.mock.calls.map(([url]) => url)).toContain(
      '/api/account/settings',
    );
    // The streaks switch mounts useStreaks, which writes this month's challenges after the pull.
    expect(
      (await outbox()).filter((op) => op.kind !== 'putChallengeMonth'),
    ).toEqual([]);
  });
});

describe('Install on the desktop (D.1)', () => {
  it('no install row even when the browser offered installing', async () => {
    offlineNow();
    listenInstallPrompt();
    dispatchEvent(
      Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => {},
      }),
    );
    await wrap(screenOf(), true);
    expect(
      await screen.findByRole('button', { name: 'Add to Home Screen' }),
    ).toBeTruthy();
    cleanup();
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q === DESKTOP_MEDIA,
    }));
    await wrap(screenOf(), true);
    await screen.findByRole('radio', { name: 'English' });
    expect(
      screen.queryByRole('button', { name: 'Add to Home Screen' }),
    ).toBeNull();
  });
});
