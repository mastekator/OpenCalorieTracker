import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import {
  API_VERSION,
  type AccountSettings,
  type MeResponse,
} from '@oct/shared';
import { AppScreens } from '../../app/routes';
import { SessionContext } from '../../app/SessionContext';
import { DataProvider } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { IntegrationsScreen } from './IntegrationsScreen';
import { McpScreen, mcpConfig } from './McpScreen';

const user = {
  id: 6,
  role: 'user',
  locale: 'en',
  methods: ['password'],
} as MeResponse;
const PUBLIC_URL = 'https://food.example.com';
const SECRET = 'oct_mcp-secret-shown-once';

type Call = { url: string; method: string; body?: unknown };

/** /api/tokens and /api/integrations answer; anything else (sync) never settles. */
function serve(blocked = false) {
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
          tokens: { count: 0, blocked },
          webhooks: { count: 0, failing: null, blocked },
          mcp: { enabled: true, blocked },
        });
      if (url.endsWith('/api/config'))
        return Response.json({
          version: '1.0.0',
          apiVersion: API_VERSION,
          publicUrl: PUBLIC_URL,
          authMethods: ['password'],
          registration: 'invite',
          setupError: null,
          setupRequired: false,
        });
      if (url === '/api/tokens' && method === 'POST')
        return Response.json(
          {
            id: 9,
            name: 'Claude Desktop',
            scope: 'read',
            createdAt: '2026-11-26T10:00:00.000Z',
            expiresAt: null,
            lastUsedAt: null,
            token: SECRET,
          },
          { status: 201 },
        );
      return new Promise<Response>(() => {});
    }),
  );
  return calls;
}

async function seed(mcpEnabled: boolean) {
  const db = await openUserDb(user.id);
  await db.put(
    'kv',
    {
      locale: 'en',
      theme: 'system',
      units: 'metric',
      settingsRev: 1,
      photoRetentionDays: 30,
      normDisclaimerHidden: false,
      offEnabled: false,
      offHintAt: null,
      mcpEnabled,
    } satisfies AccountSettings,
    'settings',
  );
  db.close();
}

async function wrap(node = <McpScreen publicUrl={`${PUBLIC_URL}/`} />) {
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

const switchOf = () =>
  screen.findByRole<HTMLButtonElement>('switch', { name: 'Access over MCP' });
const snippet = () => screen.getByLabelText('Config snippet').textContent;

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

describe('mcpConfig', () => {
  it('points both assistants at the address with the token', () => {
    const url = `${PUBLIC_URL}/mcp`;
    expect(JSON.parse(mcpConfig('cursor', url, 'T'))).toEqual({
      mcpServers: {
        oct: { url, headers: { Authorization: 'Bearer T' } },
      },
    });
    expect(JSON.parse(mcpConfig('claude', url, 'T'))).toEqual({
      mcpServers: {
        oct: {
          command: 'npx',
          args: ['mcp-remote', url, '--header', 'Authorization: Bearer T'],
        },
      },
    });
  });
});

describe('McpScreen (OCT-187 §6)', () => {
  it('the switch writes mcpEnabled and queues it', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await seed(false);
    await wrap();
    expect(screen.queryByText('Address')).toBeNull();
    fireEvent.click(await switchOf());
    const db = await openUserDb(user.id);
    await waitFor(async () =>
      expect(
        ((await db.get('kv', 'settings')) as AccountSettings).mcpEnabled,
      ).toBe(true),
    );
    expect((await db.getAll('outbox'))[0]).toMatchObject({
      kind: 'patchSettings',
      body: { mcpEnabled: true },
    });
    db.close();
    expect(await screen.findByText('Address')).toBeTruthy();
  });

  it('the admin’s token ban locks the switch and hides the address', async () => {
    serve(true);
    await seed(true);
    await wrap();
    expect(
      await screen.findByText(/The admin has turned off API/),
    ).toBeTruthy();
    const sw = await switchOf();
    expect(sw.disabled).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByText('Address')).toBeNull();
  });

  it('the token is in the snippet only right after it is created', async () => {
    const calls = serve();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await seed(true);
    const view = await wrap();
    await screen.findByText('Address');
    expect(screen.getByText(`${PUBLIC_URL}/mcp`)).toBeTruthy();
    expect(snippet()).toContain(`"${PUBLIC_URL}/mcp"`);
    expect(snippet()).toContain('YOUR_TOKEN');

    fireEvent.click(screen.getByText('Create a token for MCP'));
    await screen.findByText('Read-only · just created');
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Claude Desktop',
      scope: 'read',
      expiresInDays: null,
    });
    // Masked on screen, whole in the clipboard.
    expect(snippet()).not.toContain(SECRET);
    expect(snippet()).not.toContain('YOUR_TOKEN');
    fireEvent.click(screen.getByRole('radio', { name: 'Cursor' }));
    expect(snippet()).toContain('"headers"');
    fireEvent.click(screen.getByRole('button', { name: 'Copy config' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        mcpConfig('cursor', `${PUBLIC_URL}/mcp`, SECRET),
      ),
    );
    await screen.findByRole('button', { name: 'Copied' });
    // Another client, another snippet: the label goes back.
    fireEvent.click(screen.getByRole('radio', { name: 'Claude Desktop' }));
    expect(screen.getByRole('button', { name: 'Copy config' })).toBeTruthy();

    // No clipboard (plain http): the whole config, token included, in a sheet.
    writeText.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy config' }));
    const full = mcpConfig('claude', `${PUBLIC_URL}/mcp`, SECRET);
    expect(
      await screen.findByText(
        (_, el) => el?.textContent === full && el.tagName === 'PRE',
      ),
    ).toBeTruthy();

    view.unmount();
    await wrap();
    await screen.findByText('Address');
    expect(screen.getByText('Create a token for MCP')).toBeTruthy();
    expect(snippet()).toContain('YOUR_TOKEN');
  });
});

describe('IntegrationsScreen MCP card', () => {
  it('shows on · read-only', async () => {
    serve();
    await seed(true);
    await wrap(<IntegrationsScreen />);
    expect(await screen.findByText('MCP for AI assistants')).toBeTruthy();
    expect(await screen.findByText(/· read-only/)).toBeTruthy();
  });
});

describe('MCP route', () => {
  it('opens with the address from /api/config', async () => {
    serve();
    await seed(true);
    const location = memoryLocation({ path: '/settings/integrations/mcp' });
    await wrap(
      <Router hook={location.hook}>
        <SessionContext.Provider
          value={{
            user,
            refresh: async () => {},
            signedIn: async () => {},
            logout: async () => {},
          }}
        >
          <AppScreens />
        </SessionContext.Provider>
      </Router>,
    );
    await screen.findByText('Address');
    expect(snippet()).toContain(`${PUBLIC_URL}/mcp`);
  });
});
