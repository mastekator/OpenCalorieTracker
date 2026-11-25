import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { MeResponse, Webhook, WebhookDelivery } from '@oct/shared';
import { DataProvider } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { IntegrationsScreen } from './IntegrationsScreen';
import { WebhookScreen } from './WebhookScreen';
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
  /** GET /:id/deliveries; POST /:id/test answers like the first one. */
  log?: WebhookDelivery[];
};

/** /api/webhooks and /api/integrations answer; anything else (sync) never settles. */
function serve(
  list: Webhook[],
  { blocked = false, failing = null, error, log = [] }: Opts = {},
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
          webhooks: {
            count: list.length,
            enabled: list.filter((w) => w.enabled).length,
            failing,
            blocked,
          },
          mcp: { enabled: false, blocked: false },
        });
      if (url.startsWith('/api/webhooks')) {
        if (url.endsWith('/deliveries')) return Response.json(log);
        if (method === 'GET') return Response.json(list);
        if (error)
          return Response.json(
            { error: { code: error.code, details: error.details } },
            { status: error.status },
          );
        // A fresh row id: the test adds a row on top of the log.
        if (url.endsWith('/test'))
          return Response.json({ ...log[0], id: 1000 });
        if (url.endsWith('/secret'))
          return Response.json({ ...list[0], secret: SECRET });
        if (method === 'DELETE') return new Response(null, { status: 204 });
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
    await wrap(<WebhookScreen id="1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
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

const delivery = (
  id: number,
  more: Partial<WebhookDelivery> = {},
): WebhookDelivery => ({
  id,
  event: 'test',
  at: '2026-11-20T19:05:00.000Z',
  status: 200,
  error: null,
  attempts: 1,
  durationMs: 180,
  ...more,
});

describe('WebhookScreen (OCT-187 5.5)', () => {
  it('a delivered test shows its status and time', async () => {
    serve([hook(1, 'HA')], { log: [delivery(7)] });
    await wrap(<WebhookScreen id="1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send test' }));
    expect(
      await screen.findByText('Test delivered · 200 · 180 ms'),
    ).toBeTruthy();
  });

  it('a failed test names the reason', async () => {
    serve([hook(1, 'HA')], {
      log: [delivery(7, { status: null, error: 'timeout', durationMs: null })],
    });
    await wrap(<WebhookScreen id="1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send test' }));
    expect(
      await screen.findByText('Test not delivered · no reply in 10 s'),
    ).toBeTruthy();
  });

  it('403 outbound_disabled on test reads as the ban', async () => {
    serve([hook(1, 'HA')], {
      error: { status: 403, code: 'outbound_disabled' },
    });
    await wrap(<WebhookScreen id="1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send test' }));
    expect(
      await screen.findByText(/Your webhooks are kept but send nothing/),
    ).toBeTruthy();
  });

  it('the log shows each delivery with its response', async () => {
    serve([hook(1, 'HA')], {
      log: [
        delivery(3, { event: 'meal.saved', status: 503, attempts: 3 }),
        delivery(2, { event: 'day.closed', status: null, error: 'dns' }),
        delivery(1, { event: 'meal.saved', status: 204 }),
        delivery(0, { status: null, error: 'secret', durationMs: 0 }),
      ],
    });
    await wrap(<WebhookScreen id="1" />);
    expect(await screen.findByText('503 ×3')).toBeTruthy();
    expect(screen.getByText('host not found')).toBeTruthy();
    expect(screen.getByText('204')).toBeTruthy();
    expect(screen.getByText('secret unreadable — rotate it')).toBeTruthy();
    expect(screen.getAllByText('Meal saved')).toHaveLength(2);
  });

  it('a rotated secret is shown once, after confirming', async () => {
    const calls = serve([hook(1, 'HA')]);
    const view = await wrap(<WebhookScreen id="1" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Rotate the secret' }),
    );
    expect(calls.some((c) => c.url.endsWith('/secret'))).toBe(false);
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Rotate',
      }),
    );
    expect(await screen.findByText(SECRET)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Close',
      }),
    );
    await waitFor(() => expect(screen.queryByText(SECRET)).toBeNull());
    view.unmount();
    await wrap(<WebhookScreen id="1" />);
    await screen.findByText('HA');
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('deletes after confirming', async () => {
    const calls = serve([hook(1, 'HA')]);
    await wrap(<WebhookScreen id="1" />);
    fireEvent.click(await screen.findByText('Delete webhook'));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'DELETE')).toBe(true),
    );
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
