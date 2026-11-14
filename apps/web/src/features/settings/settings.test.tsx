import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import type { MeResponse, Passkey } from '@oct/shared';
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

/** Renders once the dictionary has loaded. */
async function wrap(node: ReactNode) {
  const view = render(
    <I18nProvider>
      <ToastProvider>
        <div data-testid="ready">{node}</div>
      </ToastProvider>
    </I18nProvider>,
  );
  await screen.findByTestId('ready');
  return view;
}

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('SettingsScreen', () => {
  it('hides the admin group from a regular user', async () => {
    await wrap(<SettingsScreen user={user} online onLogout={() => {}} />);
    expect(screen.queryByRole('heading', { name: 'Admin' })).toBeNull();
    expect(screen.queryByText('Invites')).toBeNull();
    expect(screen.getByText('Sign-in · anna@example.com')).toBeTruthy();
    expect(screen.getByText('Set password')).toBeTruthy();
  });

  it('shows the admin group to an admin, disabled offline with a toast', async () => {
    await wrap(
      <SettingsScreen user={admin} online={false} onLogout={() => {}} />,
    );
    expect(screen.getByRole('heading', { name: 'Admin' })).toBeTruthy();
    const invites = screen.getByRole('button', { name: 'Invites' });
    expect(invites.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(invites);
    expect(
      screen.getByText('Admin tools need an internet connection.'),
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText('Internet connection required')).toBeTruthy(),
    );
  });

  it('shows only enabled sign-in methods', async () => {
    await wrap(
      <SettingsScreen
        user={{ ...user, enabledMethods: ['passkey'] }}
        online
        onLogout={() => {}}
      />,
    );
    expect(screen.getByText('My passkeys')).toBeTruthy();
    expect(screen.queryByText('Set password')).toBeNull();
  });

  it('shows the admin a closable hint while the config password is in use (AC-1.7)', async () => {
    await wrap(<SettingsScreen user={admin} online onLogout={() => {}} />);
    expect(
      screen.getByText('Change the password set during installation'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(
      screen.queryByText('Change the password set during installation'),
    ).toBeNull();
    expect(localStorage.getItem(hintClosedKey(admin.id))).toBe('1');
  });

  it('signs out', async () => {
    const onLogout = vi.fn();
    await wrap(<SettingsScreen user={user} online onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onLogout).toHaveBeenCalled();
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
    const del = screen.getByRole('button', { name: 'Delete passkey' });
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
    const del = screen.getByRole('button', { name: 'Delete passkey' });
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
