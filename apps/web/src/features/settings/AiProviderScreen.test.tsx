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
import type { AdminAiStatus, MeResponse } from '@oct/shared';
import { AppScreens } from '../../app/routes';
import { SessionContext } from '../../app/SessionContext';
import { DataProvider } from '../../data/DataContext';
import { UndoDeleteProvider } from '../diary/undoDelete';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ProviderStatus } from '../../ui/ProviderStatus/ProviderStatus';
import { ToastProvider } from '../../ui/Toast/Toast';
import { AiProviderScreen } from './AiProviderScreen';
import { SettingsScreen } from './SettingsScreen';

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
const admin: MeResponse = { ...user, id: 1, role: 'admin' };
const gemini: AdminAiStatus = {
  provider: 'google',
  providerName: 'Google Gemini',
  model: 'gemini-3.8-flash',
  keySet: true,
  baseUrlHost: null,
  source: 'env',
  state: 'ok',
  checkedAt: Date.now(),
};
const off: AdminAiStatus = {
  ...gemini,
  provider: null,
  providerName: null,
  model: null,
  keySet: false,
  source: null,
  state: 'not_configured',
  checkedAt: null,
};

async function wrap(node: ReactNode, data = false) {
  const view = render(
    <I18nProvider>
      <ToastProvider>
        {data ? (
          <DataProvider user={user}>
            <UndoDeleteProvider>
              <div data-testid="ready">{node}</div>
            </UndoDeleteProvider>
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
const serve = (body: unknown, status = 200) => {
  const fetch = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
};
const status = (s: Partial<AdminAiStatus>) => (
  <ProviderStatus status={{ ...gemini, ...s }} onCheck={() => {}} />
);

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(async () => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  await clearLocal(user.id);
});

describe('AI provider: admin only', () => {
  it('a regular user has no row and is sent from the screen to /settings', async () => {
    const fetch = serve(gemini);
    await wrap(<SettingsScreen user={user} onLogout={async () => {}} />, true);
    expect(screen.queryByText('AI provider')).toBeNull();
    cleanup();

    const location = memoryLocation({
      path: '/settings/admin/ai',
      record: true,
    });
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
      true,
    );
    await waitFor(() => expect(location.history.at(-1)).toBe('/settings'));
    expect(fetch).not.toHaveBeenCalledWith('/api/admin/ai', expect.anything());
  });

  it('the admin row carries the state badge', async () => {
    serve({ ...gemini, state: 'quota_exceeded' });
    await wrap(<SettingsScreen user={admin} onLogout={async () => {}} />, true);
    const row = screen.getByRole('button', { name: /AI provider/ });
    await waitFor(() => expect(row.textContent).toContain('Quota'));
  });

  it('a failed status read leaves the row without a badge', async () => {
    serve({ error: { code: 'internal' } }, 500);
    await wrap(<SettingsScreen user={admin} onLogout={async () => {}} />, true);
    const row = screen.getByRole('button', { name: /AI provider/ });
    await waitFor(() => expect(row.textContent).toBe('AI provider'));
  });
});

describe('ProviderStatus', () => {
  it.each([
    ['ok', 'Working', null],
    ['auth_error', 'Key or access error', 'The provider rejected the key'],
    ['quota_exceeded', 'Quota exceeded', 'Request limit reached'],
    ['unavailable', 'Provider unavailable', "The provider isn't responding"],
    ['model_not_found', 'Model not found', 'The model is unavailable'],
    ['timeout', 'Slow response', 'The model is too slow'],
    ['no_vision', "Model doesn't accept images", 'Photo recognition is off'],
    ['unknown', 'Not checked yet', null],
  ] as const)('%s: status line and banner', async (state, line, banner) => {
    await wrap(status({ state }));
    expect(screen.getByText(line)).toBeTruthy();
    if (banner) expect(screen.getByText(banner)).toBeTruthy();
    else expect(document.querySelector('.provider__main .banner')).toBeNull();
    expect(screen.getByRole('button', { name: 'Check now' })).toBeTruthy();
    expect(
      screen.queryByText(/Last request|From the last request/) === null,
    ).toBe(state === 'unknown');
  });

  it('not configured: env block, no check, nothing is sent', async () => {
    await wrap(<ProviderStatus status={off} onCheck={() => {}} />);
    expect(screen.getByText("AI isn't connected")).toBeTruthy();
    expect(screen.getByText('Not set up')).toBeTruthy();
    expect(screen.getByText(/AI_PROVIDER=/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull();
    expect(
      screen.getByText(
        "While AI isn't connected, photos aren't sent anywhere.",
      ),
    ).toBeTruthy();
  });

  it('warns about the Gemini free tier only for google', async () => {
    await wrap(status({}));
    expect(screen.getByText('Gemini free tier')).toBeTruthy();
    expect(screen.getByText('Google Gemini data policy')).toBeTruthy();
    cleanup();
    await wrap(
      status({ provider: 'openai', providerName: 'OpenAI', model: 'gpt-4o' }),
    );
    expect(screen.queryByText('Gemini free tier')).toBeNull();
  });

  it('own server: the host, no policy link', async () => {
    await wrap(
      status({
        provider: 'openai-compatible',
        providerName: null,
        baseUrlHost: '192.168.1.20:11434',
      }),
    );
    expect(screen.getByText('OpenAI-compatible')).toBeTruthy();
    expect(screen.getAllByText('192.168.1.20:11434')).toHaveLength(2);
    expect(screen.queryByText(/data policy/)).toBeNull();
  });

  it('«Details» toggles aria-expanded and shows the provider message', async () => {
    await wrap(
      status({
        state: 'auth_error',
        details: { status: 403, message: 'API key not valid' },
      }),
    );
    const details = screen.getByRole('button', { name: 'Details' });
    expect(details.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(details);
    expect(details.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/HTTP 403\s+API key not valid/)).toBeTruthy();
  });
});

describe('ProviderStatus: model not found and timeout', () => {
  it('404 names the model and shows the provider reply in «Details»', async () => {
    await wrap(
      status({
        state: 'model_not_found',
        details: { status: 404, message: 'models/x is not found' },
      }),
    );
    expect(
      screen.getByText(
        "The provider doesn't have model gemini-3.8-flash. Check AI_MODEL and pick a model from the provider's list.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText(/HTTP 404\s+models\/x is not found/)).toBeTruthy();
  });

  it('own server: the 404 text also points at AI_BASE_URL', async () => {
    await wrap(
      status({
        state: 'model_not_found',
        provider: 'openai-compatible',
        providerName: null,
      }),
    );
    expect(screen.getByText(/and the AI_BASE_URL address/)).toBeTruthy();
  });

  it('timeout names the seconds and has no empty «Details»', async () => {
    await wrap(status({ state: 'timeout', details: { timeoutSec: 20 } }));
    expect(
      screen.getByText(
        'The model takes longer than 20 s to answer — choose a faster model.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
  });
});

describe('AiProviderScreen', () => {
  it('«Check now» shows the new state', async () => {
    const fetch = vi.fn(async (_: string, init?: RequestInit) =>
      Response.json(
        init?.method === 'POST' ? { ...gemini, state: 'auth_error' } : gemini,
      ),
    );
    vi.stubGlobal('fetch', fetch);
    await wrap(<AiProviderScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check now' }));
    expect(
      await screen.findByText('The provider rejected the key'),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/ai/check',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('a check too soon shows the wait from the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? Response.json(
              {
                error: {
                  code: 'too_many_attempts',
                  details: { retryAfterSec: 7 },
                },
              },
              { status: 429 },
            )
          : Response.json(gemini),
      ),
    );
    await wrap(<AiProviderScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check now' }));
    expect(
      await screen.findByText('Just checked. Try again in 7 s'),
    ).toBeTruthy();
  });

  it('offline: «Connection needed», no request, no stale data', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    const fetch = serve(gemini);
    await wrap(<AiProviderScreen />);
    expect(screen.getByText('Connection needed')).toBeTruthy();
    expect(screen.queryByText('Google Gemini')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
