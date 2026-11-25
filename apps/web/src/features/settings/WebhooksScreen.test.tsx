import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { MeResponse, Webhook } from '@oct/shared';
import { DataProvider } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { IntegrationsScreen } from './IntegrationsScreen';
import { WebhooksScreen } from './WebhooksScreen';

const user = { id: 4, role: 'user', locale: 'en' } as MeResponse;
const SECRET = 'whsec_shown-once';
const hook = (id: number, name: string, more: Partial<Webhook> = {}) =>
  ({
    id,
    name,
    url: `https://${name.toLowerCase()}.example.com/hook`,
    events: ['meal.saved'],
    dayClosedAt: '23:59',
    emptyBy: null,
    enabled: true,
    disabledReason: null,
    failStreak: 0,
    createdAt: '2026-11-01T10:00:00.000Z',
    ...more,
  }) satisfies Webhook;

type Call = { url: string; method: string; body?: Record<string, unknown> };
type Opts = {
  blocked?: boolean;
  failing?: string | null;
  /** The error the POST or PATCH answers with. */
  error?: { status: number; code: string; details?: unknown };
};

/** /api/webhooks and /api/integrations answer; anything else (sync) never settles. */
function serve(
  list: Webhook[],
  { blocked = false, failing = null, error }: Opts = {},
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      if (url.endsWith('/api/integrations'))
        return Response.json({
          barcode: { enabled: false, blocked },
          export: { lastAt: null, lastFormat: null },
          tokens: { count: 0, blocked: false },
          webhooks: { count: list.length, failing, blocked },
          mcp: { enabled: false, blocked: false },
        });
      if (url.startsWith('/api/webhooks')) {
        if (method === 'GET') return Response.json(list);
        if (error)
          return Response.json(
            { error: { code: error.code, details: error.details } },
            { status: error.status },
          );
        if (method === 'POST')
          return Response.json(
            { ...hook(99, body.name), ...body, secret: SECRET },
            { status: 201 },
          );
        const id = Number(url.split('/').pop());
        const was = list.find((w) => w.id === id)!;
        return Response.json({
          ...was,
          ...body,
          ...(body.enabled ? { disabledReason: null, failStreak: 0 } : {}),
        });
      }
      return new Promise<Response>(() => {});
    }),
  );
  return calls;
}

async function wrap(node = <WebhooksScreen />) {
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

const addButton = () =>
  screen.getAllByRole<HTMLButtonElement>('button', {
    name: 'Add webhook',
  })[0]!;

async function fillAndAdd(url: string) {
  fireEvent.click(addButton());
  fireEvent.change(await screen.findByLabelText('Name'), {
    target: { value: 'Home Assistant' },
  });
  fireEvent.change(screen.getByLabelText('URL'), { target: { value: url } });
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Add webhook',
    }),
  );
}

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
  await clearLocal(user.id);
});

describe('WebhooksScreen (OCT-187 §5)', () => {
  it('the secret is shown only right after the webhook is added', async () => {
    const calls = serve([]);
    const view = await wrap();
    await screen.findByText('No webhooks yet');
    await fillAndAdd(' https://ha.example.com/api/webhook/oct ');
    expect(await screen.findByText(SECRET)).toBeTruthy();
    expect(screen.getByText('“Home Assistant” webhook added')).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Home Assistant',
      url: 'https://ha.example.com/api/webhook/oct',
      events: ['meal.saved'],
      dayClosedAt: '23:59',
      emptyBy: '20:00',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Close',
      }),
    );
    await waitFor(() => expect(screen.queryByText(SECRET)).toBeNull());
    expect(screen.getByText('Home Assistant')).toBeTruthy();

    // Nothing kept it: not the local store, not a remount.
    const db = await openUserDb(user.id);
    const kv = JSON.stringify(await db.getAll('kv'));
    db.close();
    expect(kv).not.toContain(SECRET);
    view.unmount();
    await wrap();
    await screen.findByText('No webhooks yet');
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('http to a public host: the error sits under the address', async () => {
    serve([], { error: { status: 400, code: 'http_not_private' } });
    await wrap();
    await screen.findByText('No webhooks yet');
    await fillAndAdd('http://example.com/hook');
    const url = screen.getByLabelText('URL');
    await waitFor(() => expect(url.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText(/Internet addresses need HTTPS/)).toBeTruthy();
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('validation_failed marks the field it names', async () => {
    serve([], {
      error: {
        status: 400,
        code: 'validation_failed',
        details: [{ path: ['url'], code: 'invalid_format' }],
      },
    });
    await wrap();
    await screen.findByText('No webhooks yet');
    await fillAndAdd('https://');
    const url = screen.getByLabelText('URL');
    await waitFor(() => expect(url.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText('Check the highlighted fields')).toBeTruthy();
  });

  it('off after failures: «Turn on» sends enabled:true', async () => {
    const calls = serve([
      hook(1, 'ntfy', {
        enabled: false,
        disabledReason: 'failures',
        failStreak: 20,
      }),
    ]);
    await wrap();
    expect(await screen.findByText('after 20 failures in a row')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on «ntfy»' }));
    await waitFor(() =>
      expect(screen.queryByText('after 20 failures in a row')).toBeNull(),
    );
    expect(
      calls.find((c) => c.method === 'PATCH' && c.url === '/api/webhooks/1')
        ?.body,
    ).toEqual({ enabled: true });
    expect(screen.queryByRole('button', { name: 'Turn on «ntfy»' })).toBeNull();
  });

  it('«Turn off all» patches only the enabled ones, keeping their settings', async () => {
    const calls = serve([
      hook(1, 'HA'),
      hook(2, 'ntfy', { enabled: false }),
      hook(3, 'n8n', { failStreak: 2 }),
    ]);
    await wrap();
    fireEvent.click(await screen.findByText('Turn off all webhooks'));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Turn off all webhooks',
      }),
    );
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Turn on/ }).length).toBe(
        3,
      ),
    );
    expect(
      calls.filter((c) => c.method === 'PATCH').map((c) => [c.url, c.body]),
    ).toEqual([
      ['/api/webhooks/1', { enabled: false }],
      ['/api/webhooks/3', { enabled: false }],
    ]);
    expect(screen.queryByText('Turn off all webhooks')).toBeNull();
  });

  it('the admin ban: a banner, no adding, no turning on', async () => {
    serve([hook(1, 'ntfy', { enabled: false })], { blocked: true });
    await wrap();
    expect(
      await screen.findByText(/turned off outgoing requests/),
    ).toBeTruthy();
    await waitFor(() => expect(addButton().disabled).toBe(true));
    expect(screen.queryByRole('button', { name: /^Turn on/ })).toBeNull();
  });

  it('403 outbound_disabled reads as the ban', async () => {
    serve([hook(1, 'ntfy', { enabled: false })], {
      error: { status: 403, code: 'outbound_disabled' },
    });
    await wrap();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Turn on «ntfy»' }),
    );
    expect(
      await screen.findByText(/Your webhooks are kept but send nothing/),
    ).toBeTruthy();
  });

  it('edits through the same sheet with PATCH', async () => {
    const calls = serve([hook(1, 'HA')]);
    await wrap();
    fireEvent.click(await screen.findByText('HA'));
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('switch', { name: 'Day closed' }));
    fireEvent.change(within(sheet).getByLabelText('Day closed at'), {
      target: { value: '22:30' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'PATCH')).toBe(true),
    );
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      name: 'HA',
      url: 'https://ha.example.com/hook',
      events: ['meal.saved', 'day.closed'],
      dayClosedAt: '22:30',
      emptyBy: '20:00',
    });
  });
});

describe('IntegrationsScreen: the webhooks card', () => {
  it('names the failing webhook', async () => {
    serve([hook(1, 'ntfy')], { failing: 'ntfy' });
    await wrap(<IntegrationsScreen />);
    expect(await screen.findByText('ntfy isn’t delivering')).toBeTruthy();
    expect(screen.getByText('Error')).toBeTruthy();
  });
});
