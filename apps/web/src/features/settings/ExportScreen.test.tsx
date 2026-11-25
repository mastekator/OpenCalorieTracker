import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { MeResponse } from '@oct/shared';
import { DataProvider } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { ExportScreen } from './ExportScreen';

const user = { id: 3, role: 'user', locale: 'en' } as MeResponse;
const summary = { days: 12, dishes: 40, photos: 3, bytes: 100 };

/** The download body is fed by the test through `push`; summary and integrations answer at once. */
function serve(download: () => Response) {
  const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    (input) => {
      const url = String(input);
      if (url.startsWith('/api/export/summary'))
        return Promise.resolve(Response.json(summary));
      if (url.startsWith('/api/export?')) return Promise.resolve(download());
      return new Promise<Response>(() => {});
    },
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function stream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start: (c) => void (controller = c),
  });
  const response = () =>
    new Response(body, {
      headers: {
        'Content-Length': '100',
        'Content-Disposition':
          'attachment; filename="oct-export-2026-11-25.json"',
      },
    });
  return { controller, response };
}

async function wrap() {
  render(
    <I18nProvider>
      <ToastProvider>
        <DataProvider user={user}>
          <div data-testid="ready">
            <ExportScreen />
          </div>
        </DataProvider>
      </ToastProvider>
    </I18nProvider>,
  );
  await screen.findByTestId('ready');
}

const downloadButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: /Download|Preparing/ });

beforeEach(async () => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  const db = await openUserDb(user.id);
  await db.put('kv', 1, 'rev');
  db.close();
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(async () => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await clearLocal(user.id);
});

describe('ExportScreen (OCT-187 §2)', () => {
  it('shows the summary and a real percent, then saves the file', async () => {
    const s = stream();
    serve(s.response);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    await wrap();
    expect(await screen.findByText('12 days · 40 dishes · ~1 kB')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download ZIP' }));
    await waitFor(() => expect(s.controller).toBeTruthy());
    s.controller.enqueue(new Uint8Array(42));
    expect(
      await screen.findByRole('button', { name: 'Preparing the file… 42%' }),
    ).toBeTruthy();
    s.controller.enqueue(new Uint8Array(58));
    s.controller.close();
    expect(
      await screen.findByText('File downloaded · oct-export-2026-11-25.json'),
    ).toBeTruthy();
    expect(click).toHaveBeenCalledOnce();
    expect(downloadButton().textContent).toBe('Download ZIP');
  });

  it('«Cancel» aborts the download and brings the button back', async () => {
    const s = stream();
    const fetch = serve(s.response);
    await wrap();
    await screen.findByText(/12 days/);
    fireEvent.click(screen.getByRole('button', { name: 'Download ZIP' }));
    s.controller.enqueue(new Uint8Array(10));
    await screen.findByRole('button', { name: 'Preparing the file… 10%' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(downloadButton().textContent).toBe('Download ZIP'),
    );
    const init = fetch.mock.calls.find(([u]) =>
      u.startsWith('/api/export?'),
    )![1];
    expect(init?.signal?.aborted).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('offline: the button is off and says why', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await wrap();
    expect(
      await screen.findByText(
        'Needs a network: the file is built on the server',
      ),
    ).toBeTruthy();
    expect(downloadButton().disabled).toBe(true);
  });

  it('413: «Pick a shorter period»', async () => {
    serve(() =>
      Response.json({ error: { code: 'export_too_large' } }, { status: 413 }),
    );
    await wrap();
    await screen.findByText(/12 days/);
    fireEvent.click(screen.getByRole('button', { name: 'Download ZIP' }));
    expect(await screen.findByText(/Pick a shorter period/)).toBeTruthy();
  });

  it('opens on CSV; photos: how many, before the switch is on; JSON with photos is a ZIP', async () => {
    serve(() => new Response(null, { status: 500 }));
    await wrap();
    expect(
      await screen.findByText('The file gets bigger: ~3 photos'),
    ).toBeTruthy();
    expect(downloadButton().textContent).toBe('Download ZIP');
    fireEvent.click(screen.getByRole('radio', { name: 'JSON' }));
    expect(downloadButton().textContent).toBe('Download JSON');
    fireEvent.click(screen.getByRole('switch', { name: 'Add photos' }));
    expect(downloadButton().textContent).toBe('Download ZIP');
  });

  it('«Pick dates» opens on 1 January to today, ready to download', async () => {
    const fetch = serve(() => new Response(null, { status: 500 }));
    await wrap();
    await screen.findByText(/12 days/);
    fireEvent.click(screen.getByRole('radio', { name: 'Pick dates' }));
    const today = new Date().toLocaleDateString('sv');
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/export/summary?format=csv&photos=0&from=${today.slice(0, 4)}-01-01&to=${today}`,
        expect.anything(),
      ),
    );
    expect(downloadButton().disabled).toBe(false);
  });
});
