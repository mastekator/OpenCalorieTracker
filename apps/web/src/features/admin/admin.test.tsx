import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import type { AdminBlock, AdminUser, Invite, MeResponse } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { SettingsScreen } from '../settings/SettingsScreen';
import { BlocksScreen } from './BlocksScreen';
import { InvitesScreen } from './InvitesScreen';
import { LinkReadySheet } from './LinkReadySheet';
import { UsersScreen } from './UsersScreen';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const invite = (id: number, over: Partial<Invite>): Invite => ({
  id,
  email: `u${id}@example.com`,
  createdAt: now - 50 * DAY,
  expiresAt: now + DAY,
  usedAt: null,
  revokedAt: null,
  status: 'pending',
  ...over,
});
const invites = [
  invite(1, {}),
  // Created 50 days ago but used yesterday: still «Earlier · 30 days».
  invite(2, { status: 'used', usedAt: now - DAY }),
  invite(3, { status: 'expired', expiresAt: now - 40 * DAY }),
];
const admin: MeResponse = {
  id: 1,
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  locale: 'en',
  theme: 'system',
  units: 'metric',
  normDisclaimerHidden: false,
  passwordFromConfig: false,
  methods: ['passkey'],
  enabledMethods: ['passkey'],
};
const users: AdminUser[] = [
  {
    id: 1,
    email: 'admin@example.com',
    name: 'Admin',
    role: 'admin',
    createdAt: now,
    lastLoginAt: now,
  },
  {
    id: 2,
    email: 'b@example.com',
    name: null,
    role: 'user',
    createdAt: now,
    lastLoginAt: null,
  },
];
const block: AdminBlock = {
  id: 7,
  kind: 'device',
  ip: '10.0.0.5',
  device: 'iPhone · Safari',
  blockedAt: now,
  failCount: 10,
  lastEmail: 'b@example.com',
};

/** GET answers from `get` by path; writes answer `write` (204 by default). */
function serve(
  get: Record<string, unknown>,
  write: () => Response = () => new Response(null, { status: 204 }),
) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) =>
    init?.method && init.method !== 'GET'
      ? write()
      : Response.json(get[url] ?? { error: { code: 'not_found' } }, {
          status: url in get ? 200 : 404,
        }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function wrap(node: ReactNode, path = '/settings/admin/invites') {
  const location = memoryLocation({ path, record: true });
  render(
    <I18nProvider>
      <ToastProvider>
        <Router hook={location.hook}>
          <div data-testid="ready">{node}</div>
        </Router>
      </ToastProvider>
    </I18nProvider>,
  );
  await screen.findByTestId('ready');
  return location;
}

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('LinkReadySheet without navigator.share', () => {
  it('«Copy» is primary; closing asks first until the link is copied', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      share: undefined,
      clipboard: { writeText: vi.fn(async () => {}) },
    });
    const onClose = vi.fn();
    await wrap(
      <LinkReadySheet
        url="https://x.test/invite#t"
        body="For b"
        onClose={onClose}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    const copy = screen.getByRole('button', { name: 'Copy' });
    expect(copy.className).toContain('button--primary');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Close? The link won’t be shown again.'),
    ).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]!);

    fireEvent.click(copy);
    expect(await screen.findByText('Link copied')).toBeTruthy();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://x.test/invite#t',
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('InvitesScreen', () => {
  it('splits pending, the last 30 days by status change, and hides older', async () => {
    serve({ '/api/admin/invites': invites });
    await wrap(<InvitesScreen />);
    expect(await screen.findByText('Pending')).toBeTruthy();
    expect(screen.getByText('u1@example.com')).toBeTruthy();
    expect(screen.getByText('u2@example.com')).toBeTruthy();
    expect(screen.queryByText('u3@example.com')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByText('u3@example.com')).toBeTruthy();
  });

  it('a 409 on revoke toasts and reloads instead of an error screen', async () => {
    const fetch = serve({ '/api/admin/invites': invites }, () =>
      Response.json({ error: { code: 'invite_used' } }, { status: 409 }),
    );
    await wrap(<InvitesScreen />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke u1@example.com' }),
    );
    const dialogRevoke = screen
      .getAllByRole('button', { name: 'Revoke' })
      .at(-1)!;
    fireEvent.click(dialogRevoke);
    expect(
      await screen.findByText('This invitation has already been used'),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        fetch.mock.calls.filter(([u]) => u === '/api/admin/invites'),
      ).toHaveLength(2),
    );
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('an empty email is explained under the field, not sent', async () => {
    const fetch = serve({ '/api/admin/invites': invites });
    await wrap(<InvitesScreen />, '/settings/admin/invites?new');
    const submit = await screen.findByRole('button', { name: 'Create link' });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);
    expect(await screen.findByText('Enter an email')).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByLabelText('Invitee’s email'),
    );
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
      false,
    );
  });

  it('empty state', async () => {
    serve({ '/api/admin/invites': [] });
    await wrap(<InvitesScreen />);
    expect(await screen.findByText('No invites yet')).toBeTruthy();
  });
});

describe('UsersScreen', () => {
  it('one’s own row opens nothing; deleting goes through the explicit confirm', async () => {
    const fetch = serve({ '/api/admin/users': users });
    await wrap(<UsersScreen selfId={1} />);
    expect(await screen.findByText('Admin')).toBeTruthy();
    // A named user shows the email too (4.4).
    expect(screen.getByText(/admin@example\.com/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Admin/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /b@example\.com/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete user' }));
    expect(
      screen.getByText(
        'b@example.com’s diary, profile and photos will be deleted. This can’t be undone.',
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Delete user' }).at(-1)!,
    );
    expect(await screen.findByText('User b@example.com deleted')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/users/2',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('BlocksScreen', () => {
  it('unblocks without a confirm and toasts', async () => {
    const fetch = serve({ '/api/admin/blocks': [block] });
    await wrap(<BlocksScreen />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Unblock iPhone · Safari, IP 10.0.0.5',
      }),
    );
    expect(await screen.findByText('Unblocked')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/blocks/7',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('Settings: blocks badge', () => {
  it('shows the count only when there are blocks', async () => {
    serve({ '/api/admin/blocks': [block, { ...block, id: 8 }] });
    await wrap(
      <SettingsScreen user={admin} onLogout={() => {}} />,
      '/settings',
    );
    const row = screen.getByRole('button', { name: /Blocks/ });
    await waitFor(() => expect(row.textContent).toBe('Blocks2'));
    cleanup();
    serve({ '/api/admin/blocks': [] });
    await wrap(
      <SettingsScreen user={admin} onLogout={() => {}} />,
      '/settings',
    );
    const again = screen.getByRole('button', { name: /Blocks/ });
    await new Promise((r) => setTimeout(r, 20));
    expect(again.textContent).toBe('Blocks');
  });
});
