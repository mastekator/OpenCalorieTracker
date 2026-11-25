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
  AdminIntegrations,
  MeResponse,
} from '@oct/shared';
import { DataProvider } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { AdminIntegrationsScreen } from '../admin/AdminIntegrationsScreen';
import {
  BarcodeIntegrationScreen,
  IntegrationsScreen,
} from './IntegrationsScreen';

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
  enabledMethods: ['passkey'],
};
const settings = (offEnabled: boolean): AccountSettings => ({
  locale: 'en',
  theme: 'system',
  units: 'metric',
  settingsRev: 1,
  photoRetentionDays: 30,
  normDisclaimerHidden: false,
  offEnabled,
  offHintAt: null,
});
const seed = async (offEnabled: boolean, blocked?: boolean) => {
  const db = await openUserDb(user.id);
  await db.put('kv', settings(offEnabled), 'settings');
  await db.put('kv', 1, 'rev');
  if (blocked !== undefined)
    await db.put(
      'kv',
      {
        barcode: { enabled: offEnabled, blocked },
        export: { lastAt: null, lastFormat: null },
        tokens: { count: 0, blocked: false },
        webhooks: { count: 0, enabled: 0, failing: null, blocked: false },
        mcp: { enabled: false, blocked: false },
      },
      'integrations',
    );
  db.close();
};
const local = async () => {
  const db = await openUserDb(user.id);
  const [s, ops] = [await db.get('kv', 'settings'), await db.getAll('outbox')];
  db.close();
  return { s: s as AccountSettings, ops };
};
const offline = () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
};
/** GET /api/integrations answers `blocked`; anything else (sync) never settles. */
const serveBlocked = (blocked: boolean) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) =>
      String(input).endsWith('/api/integrations')
        ? Promise.resolve(
            Response.json({
              barcode: { enabled: false, blocked },
              export: { lastAt: null, lastFormat: null },
              tokens: { count: 0, blocked: false },
              webhooks: { count: 0, enabled: 0, failing: null, blocked: false },
              mcp: { enabled: false, blocked: false },
            }),
          )
        : new Promise(() => {}),
    ),
  );

async function wrap(node: ReactNode, data = true) {
  render(
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
}

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(async () => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await clearLocal(user.id);
});

describe('IntegrationsScreen (OCT-313 §4)', () => {
  it.each([
    [false, false, 'Off'],
    [true, false, 'On'],
    // The admin's ban wins over the user's own switch (E-6).
    [true, true, 'Turned off by your admin'],
  ])('offEnabled %s, blocked %s: «%s»', async (on, blocked, status) => {
    await seed(on);
    serveBlocked(blocked);
    await wrap(<IntegrationsScreen />);
    // The tokens card, with none, says «Off» too.
    expect((await screen.findAllByText(status)).length).toBeGreaterThan(0);
    expect(screen.getByText('Barcode lookup')).toBeTruthy();
  });

  it('groups follow OCT-187 1.1; the in-app hint is not a control', async () => {
    await seed(false);
    serveBlocked(false);
    await wrap(<IntegrationsScreen />);
    await screen.findByText('Barcode lookup');
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual(['Your data', 'Connections', 'In the app']);
    const health = screen.getByText('Apple Health and Health Connect');
    expect(health.closest('button, a')).toBeNull();
    expect(
      screen.getByText('Available in the iOS and Android app'),
    ).toBeTruthy();
  });

  it('the import card counts imports and entries', async () => {
    await seed(false);
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) =>
        String(input) === '/api/imports'
          ? Promise.resolve(
              Response.json([
                { id: 2, source: 'csv', committedAt: 2, records: 1200 },
                { id: 1, source: 'oct', committedAt: 1, records: 34 },
              ]),
            )
          : new Promise(() => {}),
      ),
    );
    await wrap(<IntegrationsScreen />);
    expect(await screen.findByText('2 imports · 1,234 entries')).toBeTruthy();
  });

  it('the export card shows the last export, or what it does before one', async () => {
    await seed(false);
    serveBlocked(false);
    await wrap(<IntegrationsScreen />);
    expect(
      await screen.findByText('Download your diary as CSV or JSON'),
    ).toBeTruthy();
    cleanup();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) =>
        String(input).endsWith('/api/integrations')
          ? Promise.resolve(
              Response.json({
                barcode: { enabled: false, blocked: false },
                export: {
                  lastAt: '2026-11-12T12:00:00.000Z',
                  lastFormat: 'json',
                },
                tokens: { count: 0, blocked: false },
                webhooks: {
                  count: 0,
                  enabled: 0,
                  failing: null,
                  blocked: false,
                },
                mcp: { enabled: false, blocked: false },
              }),
            )
          : new Promise(() => {}),
      ),
    );
    await wrap(<IntegrationsScreen />);
    expect(await screen.findByText('Last export — Nov 12, JSON')).toBeTruthy();
  });

  it('offline shows the last known ban', async () => {
    offline();
    await seed(true, true);
    await wrap(<IntegrationsScreen />);
    expect(await screen.findByText('Turned off by your admin')).toBeTruthy();
  });
});

describe('BarcodeIntegrationScreen', () => {
  const switchOf = () =>
    screen.findByRole('switch', { name: 'Search Open Food Facts' });

  it('the switch writes offEnabled locally and queues it', async () => {
    offline();
    await seed(false);
    await wrap(<BarcodeIntegrationScreen />);
    fireEvent.click(await switchOf());
    await waitFor(async () => expect((await local()).s.offEnabled).toBe(true));
    expect((await local()).ops[0]).toMatchObject({
      kind: 'patchSettings',
      body: { offEnabled: true },
    });
    expect(await screen.findByText('On')).toBeTruthy();
  });

  it('«Turn off» asks first', async () => {
    offline();
    await seed(true);
    await wrap(<BarcodeIntegrationScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    expect(
      screen.getByText('Turn off barcode lookup? Your products are kept.'),
    ).toBeTruthy();
    expect((await local()).s.offEnabled).toBe(true);
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(
      [...dialog.querySelectorAll('button')].find(
        (b) => b.textContent === 'Turn off',
      )!,
    );
    await waitFor(async () => expect((await local()).s.offEnabled).toBe(false));
  });

  it('the admin ban locks the switch and keeps the user’s choice', async () => {
    await seed(true);
    serveBlocked(true);
    await wrap(<BarcodeIntegrationScreen />);
    expect(
      await screen.findByText(/The admin has blocked outgoing requests/),
    ).toBeTruthy();
    const sw = (await switchOf()) as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull();
    expect((await local()).s.offEnabled).toBe(true);
  });
});

describe('AdminIntegrationsScreen (OCT-187 7.1–7.3)', () => {
  const serve = (
    get: AdminIntegrations,
    put: () => Response = () => Response.json(get),
  ) => {
    const fetch = vi.fn(async (_: string, init?: RequestInit) =>
      init?.method === 'PUT' ? put() : Response.json(get),
    );
    vi.stubGlobal('fetch', fetch);
    return fetch;
  };
  const puts = (fetch: ReturnType<typeof serve>) =>
    fetch.mock.calls
      .filter(([, init]) => init?.method === 'PUT')
      .map(([, init]) => JSON.parse(String(init!.body)));
  const switchOf = () =>
    screen.findByRole('switch', { name: 'Outgoing requests from the server' });

  it('blocking asks first, then PUTs', async () => {
    const fetch = serve({
      outbound: true,
      outboundFromEnv: false,
      tokens: true,
      tokensFromEnv: false,
    });
    await wrap(<AdminIntegrationsScreen />, false);
    fireEvent.click(await switchOf());
    expect(screen.getByText('Block outgoing requests?')).toBeTruthy();
    expect(puts(fetch)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(puts(fetch)).toEqual([{ outbound: false }]));
  });

  it('allowing PUTs at once', async () => {
    const fetch = serve({
      outbound: false,
      outboundFromEnv: false,
      tokens: true,
      tokensFromEnv: false,
    });
    await wrap(<AdminIntegrationsScreen />, false);
    fireEvent.click(await switchOf());
    await waitFor(() => expect(puts(fetch)).toEqual([{ outbound: true }]));
  });

  it('set in .env: a banner and a switch that does not toggle', async () => {
    serve({
      outbound: false,
      outboundFromEnv: true,
      tokens: true,
      tokensFromEnv: false,
    });
    await wrap(<AdminIntegrationsScreen />, false);
    expect(((await switchOf()) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Set in .env')).toBeTruthy();
    expect(screen.getByText('ALLOW_OUTBOUND_REQUESTS=false')).toBeTruthy();
  });

  it('tokens: turning off asks first, then PUTs only tokens', async () => {
    const fetch = serve({
      outbound: true,
      outboundFromEnv: false,
      tokens: true,
      tokensFromEnv: false,
    });
    await wrap(<AdminIntegrationsScreen />, false);
    fireEvent.click(
      await screen.findByRole('switch', { name: 'Personal API tokens' }),
    );
    expect(screen.getByText('Turn off API tokens?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(puts(fetch)).toEqual([{ tokens: false }]));
  });

  it('tokens set in .env: the switch is locked and the banner names it', async () => {
    serve({
      outbound: true,
      outboundFromEnv: false,
      tokens: false,
      tokensFromEnv: true,
    });
    await wrap(<AdminIntegrationsScreen />, false);
    const tokens = (await screen.findByRole('switch', {
      name: 'Personal API tokens',
    })) as HTMLButtonElement;
    expect(tokens.disabled).toBe(true);
    expect(((await switchOf()) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('ALLOW_API_TOKENS=false')).toBeTruthy();
    expect(screen.queryByText(/ALLOW_OUTBOUND_REQUESTS/)).toBeNull();
  });

  it('409 outbound_env_managed: the error and a fresh read', async () => {
    const fetch = serve(
      {
        outbound: false,
        outboundFromEnv: false,
        tokens: true,
        tokensFromEnv: false,
      },
      () =>
        Response.json(
          { error: { code: 'outbound_env_managed' } },
          { status: 409 },
        ),
    );
    await wrap(<AdminIntegrationsScreen />, false);
    fireEvent.click(await switchOf());
    expect(
      await screen.findByText(/Outbound requests are set in the server/),
    ).toBeTruthy();
    expect(
      fetch.mock.calls.filter(([, i]) => !i?.method || i.method === 'GET')
        .length,
    ).toBe(2);
  });
});

describe('IntegrationsScreen: «Turn off» on the hub (OCT-187 1.2, 1.4)', () => {
  type Call = { url: string; method: string; body?: unknown };
  const hook = (id: number, enabled: boolean) => ({
    id,
    name: `hook${id}`,
    url: `https://hook${id}.example.com/`,
    events: ['meal.saved'],
    dayClosedAt: '23:59',
    emptyBy: null,
    enabled,
    disabledReason: null,
    failStreak: 0,
    createdAt: '2026-11-01T10:00:00.000Z',
  });
  /** A tiny server: tokens and webhooks change under DELETE and PATCH; the summary follows them. */
  function serve({ fail = false } = {}) {
    let tokens = 2;
    const hooks = [hook(1, true), hook(2, false), hook(3, true)];
    const calls: Call[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        if (method !== 'GET') calls.push({ url, method, body });
        if (url.endsWith('/api/integrations'))
          return Response.json({
            barcode: { enabled: true, blocked: false },
            export: { lastAt: null, lastFormat: null },
            tokens: { count: tokens, blocked: false },
            webhooks: {
              count: hooks.length,
              enabled: hooks.filter((h) => h.enabled).length,
              failing: null,
              blocked: false,
            },
            mcp: { enabled: true, blocked: false },
          });
        if (url === '/api/tokens' && method === 'DELETE') {
          if (fail)
            return Response.json(
              { error: { code: 'forbidden' } },
              { status: 403 },
            );
          tokens = 0;
          return new Response(null, { status: 204 });
        }
        if (url === '/api/webhooks') return Response.json(hooks);
        const m = /^\/api\/webhooks\/(\d+)$/.exec(url);
        if (m && method === 'PATCH') {
          const h = hooks.find((x) => x.id === Number(m[1]))!;
          h.enabled = body.enabled;
          return Response.json(h);
        }
        return new Promise(() => {});
      }),
    );
    return calls;
  }
  const seedOn = async () => {
    const db = await openUserDb(user.id);
    await db.put('kv', { ...settings(true), mcpEnabled: true }, 'settings');
    await db.put('kv', 1, 'rev');
    db.close();
  };
  const offOf = (name: string) =>
    screen.findByRole('button', { name: `Turn off «${name}»` });

  it('each card that is on has its own «Turn off»; Cancel changes nothing', async () => {
    await seedOn();
    const calls = serve();
    await wrap(<IntegrationsScreen />);
    for (const name of [
      'Barcode lookup',
      'Access tokens',
      'Webhooks',
      'MCP for AI assistants',
    ])
      await offOf(name);
    fireEvent.click(await offOf('Access tokens'));
    expect(await screen.findByText('Revoke all tokens?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByText('Revoke all tokens?')).toBeNull(),
    );
    expect(calls).toEqual([]);
    expect((await local()).s.offEnabled).toBe(true);
  });

  it('cards that are off have no «Turn off»', async () => {
    await seed(false);
    serveBlocked(false);
    await wrap(<IntegrationsScreen />);
    await screen.findByText('Barcode lookup');
    expect(screen.queryAllByRole('button', { name: /^Turn off/ })).toEqual([]);
  });

  it('tokens: revokes all and the card reads «Off» without a reload', async () => {
    await seedOn();
    const calls = serve();
    await wrap(<IntegrationsScreen />);
    fireEvent.click(await offOf('Access tokens'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke all tokens' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Turn off «Access tokens»' }),
      ).toBeNull(),
    );
    expect(calls).toEqual([{ url: '/api/tokens', method: 'DELETE' }]);
  });

  it('webhooks: one PATCH per webhook that is on, then «Off»', async () => {
    await seedOn();
    const calls = serve();
    await wrap(<IntegrationsScreen />);
    fireEvent.click(await offOf('Webhooks'));
    expect(await screen.findByText('Turn off all webhooks?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Turn off «Webhooks»' }),
      ).toBeNull(),
    );
    expect(calls).toEqual([
      { url: '/api/webhooks/1', method: 'PATCH', body: { enabled: false } },
      { url: '/api/webhooks/3', method: 'PATCH', body: { enabled: false } },
    ]);
  });

  it.each([
    ['Barcode lookup', 'offEnabled'],
    ['MCP for AI assistants', 'mcpEnabled'],
  ] as const)('%s: turns the user switch off', async (name, key) => {
    await seedOn();
    serve();
    await wrap(<IntegrationsScreen />);
    fireEvent.click(await offOf(name));
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    await waitFor(async () => expect((await local()).s[key]).toBe(false));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: `Turn off «${name}»` }),
      ).toBeNull(),
    );
  });

  it('a failure shows a toast and the card keeps what is still on', async () => {
    await seedOn();
    serve({ fail: true });
    await wrap(<IntegrationsScreen />);
    fireEvent.click(await offOf('Access tokens'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke all tokens' }),
    );
    expect(
      await screen.findByText('You don’t have access to this'),
    ).toBeTruthy();
    expect(await offOf('Access tokens')).toBeTruthy();
  });

  it('offline the buttons are inactive and say why (1.5)', async () => {
    await seedOn();
    offline();
    await wrap(<IntegrationsScreen />);
    const button = (await offOf('Barcode lookup')) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('Turning off needs a network')).toBeTruthy();
  });
});
