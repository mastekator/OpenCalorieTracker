import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ApiToken, MeResponse } from '@oct/shared';
import { DataProvider } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { IntegrationsScreen } from './IntegrationsScreen';
import { TokensScreen } from './TokensScreen';

const user = { id: 4, role: 'user', locale: 'en' } as MeResponse;
const SECRET = 'oct_secret-value-shown-once';
const token = (id: number, name: string): ApiToken => ({
  id,
  name,
  scope: 'read',
  createdAt: '2026-11-01T10:00:00.000Z',
  expiresAt: null,
  lastUsedAt: null,
});

type Call = { url: string; method: string; body?: unknown };

/** /api/tokens and /api/integrations answer; anything else (sync) never settles. */
function serve(list: ApiToken[], blocked = false) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (url.endsWith('/api/integrations'))
        return Response.json({
          barcode: { enabled: false, blocked: false },
          export: { lastAt: null, lastFormat: null },
          tokens: { count: list.length, blocked },
          webhooks: { count: 0, failing: null, blocked: false },
          mcp: { enabled: false, blocked: false },
        });
      if (url.startsWith('/api/tokens')) {
        if (method === 'GET') return Response.json(list);
        if (method === 'POST')
          return Response.json(
            { ...token(99, 'Home Assistant'), token: SECRET },
            { status: 201 },
          );
        return new Response(null, { status: 204 });
      }
      return new Promise<Response>(() => {});
    }),
  );
  return calls;
}

async function wrap(node = <TokensScreen />) {
  const view = render(
    <I18nProvider>
      <ToastProvider>
        <DataProvider user={user}>
          <div data-testid="ready">{node}</div>
        </DataProvider>
      </ToastProvider>
    </I18nProvider>,
  );
  await screen.findByTestId('ready');
  return view;
}

const createButton = () =>
  screen.getAllByRole<HTMLButtonElement>('button', {
    name: 'Create token',
  })[0]!;

beforeEach(async () => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  const db = await openUserDb(user.id);
  await db.put('kv', 1, 'rev');
  db.close();
});
afterEach(async () => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (navigator as { clipboard?: unknown }).clipboard;
  await clearLocal(user.id);
});

describe('TokensScreen (OCT-187 §4)', () => {
  it('the token is shown only right after it is created', async () => {
    const calls = serve([]);
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const view = await wrap();
    await screen.findByText('No tokens yet');
    fireEvent.click(createButton());
    const name = await screen.findByLabelText('Name');
    expect(document.activeElement).toBe(name);
    fireEvent.change(name, { target: { value: ' Home Assistant ' } });
    const sheet = screen.getByRole('dialog');
    fireEvent.click(
      within(sheet).getByRole('radio', { name: /Read and write/ }),
    );
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Create token' }),
    );
    expect(await screen.findByText(SECRET)).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Home Assistant',
      scope: 'write',
      expiresInDays: 90,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByText(SECRET)).toBeNull());
    expect(screen.getByText('Home Assistant')).toBeTruthy();

    // Nothing kept it: not the local store, not a remount.
    const db = await openUserDb(user.id);
    const kv = JSON.stringify(await db.getAll('kv'));
    db.close();
    expect(kv).not.toContain(SECRET);
    view.unmount();
    await wrap();
    await screen.findByText('No tokens yet');
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('«Done» before copying asks first', async () => {
    serve([]);
    await wrap();
    await screen.findByText('No tokens yet');
    fireEvent.click(createButton());
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Script' },
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Create token',
      }),
    );
    await screen.findByText(SECRET);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Close without copying?')).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Close',
      }),
    );
    await waitFor(() => expect(screen.queryByText(SECRET)).toBeNull());
  });

  it('revoking removes the row', async () => {
    const calls = serve([token(1, 'Home Assistant'), token(2, 'Script')]);
    await wrap();
    await screen.findByText('2 of 20');
    fireEvent.click(screen.getAllByRole('button', { name: 'Revoke' })[0]!);
    expect(screen.getByText('Revoke «Home Assistant»?')).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Revoke',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Home Assistant')).toBeNull(),
    );
    expect(screen.getByText('Script')).toBeTruthy();
    expect(
      calls.some((c) => c.method === 'DELETE' && c.url === '/api/tokens/1'),
    ).toBe(true);
  });

  it('«Revoke all tokens» empties the list', async () => {
    const calls = serve([token(1, 'Home Assistant')]);
    await wrap();
    fireEvent.click(await screen.findByText('Revoke all tokens'));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Revoke all tokens',
      }),
    );
    expect(await screen.findByText('No tokens yet')).toBeTruthy();
    expect(
      calls.some((c) => c.method === 'DELETE' && c.url === '/api/tokens'),
    ).toBe(true);
  });

  it('20 tokens: creating is off and says why', async () => {
    serve(Array.from({ length: 20 }, (_, i) => token(i + 1, `T${i + 1}`)));
    await wrap();
    await screen.findByText('20 of 20');
    expect(createButton().disabled).toBe(true);
    expect(screen.getByText(/You have 20 tokens already/)).toBeTruthy();
  });

  it('the admin ban: a banner, no creating, revoking still works', async () => {
    serve([token(1, 'Home Assistant')], true);
    await wrap();
    expect(await screen.findByText(/turned off API tokens/)).toBeTruthy();
    await waitFor(() => expect(createButton().disabled).toBe(true));
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Revoke' })
        .disabled,
    ).toBe(false);
  });
});

describe('IntegrationsScreen: the tokens card', () => {
  it('counts the tokens, and shows the admin ban', async () => {
    serve([token(1, 'A'), token(2, 'B')], true);
    await wrap(<IntegrationsScreen />);
    expect(await screen.findByText('2 tokens')).toBeTruthy();
    // The ban covers the tokens card and the MCP card.
    await waitFor(() =>
      expect(screen.getAllByText('Turned off by your admin').length).toBe(2),
    );
  });
});
