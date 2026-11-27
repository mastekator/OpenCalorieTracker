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
  keyLast4: null,
  keyUnreadable: false,
  savedInactive: false,
  rev: null,
  allowUserKeys: true,
  userKeysLocked: false,
  userKeyCount: 0,
  chatgpt: null,
  refineLimit: null,
  testPhotoCount: 9,
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
  <ProviderStatus status={{ ...gemini, ...s }} />
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
    else
      expect(
        document.querySelector('.banner--danger, .banner--warning'),
      ).toBeNull();
    expect(
      screen.queryByText(/Last request|From the last request/) === null,
    ).toBe(state === 'unknown');
  });

  it('not configured: grey state, nothing is sent', async () => {
    await wrap(<ProviderStatus status={off} />);
    expect(screen.getByText("AI isn't connected")).toBeTruthy();
    expect(screen.getByText('Not set up')).toBeTruthy();
    expect(
      screen.getByText(
        "While AI isn't connected, photos aren't sent anywhere.",
      ),
    ).toBeTruthy();
  });

  it('saved from the screen: the banner does not point at AI_*', async () => {
    await wrap(status({ state: 'auth_error', source: 'admin' }));
    expect(screen.getByText(/Check the key and model access/)).toBeTruthy();
    expect(screen.queryByText(/AI_API_KEY/)).toBeNull();
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
    expect(screen.getAllByText('192.168.1.20:11434')).toHaveLength(1);
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

describe('AiProviderScreen: settings form', () => {
  const saved: AdminAiStatus = {
    ...gemini,
    source: 'admin',
    keyLast4: 'a3F9',
    rev: 3,
  };
  type Call = { method: string; url: string; body: unknown };
  const list = {
    models: [
      { id: 'gemini-3.8-flash', vision: true },
      { id: 'gemini-3.8-pro', vision: true },
      { id: 'gemma-4-2b-it', vision: false },
    ],
  };
  /** Answers by method, the model list separately; records every call with its JSON body. */
  function server(
    answer: (call: Call) => [unknown, number?],
    models: [unknown, number?] = [list],
  ) {
    const calls: Call[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const call = {
          method: init?.method ?? 'GET',
          url,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        };
        calls.push(call);
        const [body, code = 200] = url.endsWith('/models')
          ? models
          : answer(call);
        return Response.json(body, { status: code });
      }),
    );
    return calls;
  }
  const field = (name: string) =>
    screen.getByLabelText(name) as HTMLInputElement;
  const type = (name: string, value: string) =>
    fireEvent.change(field(name), { target: { value } });
  const modelRow = () => screen.getByRole('button', { name: /^Model/ });
  /** Through the sheet's manual entry: works for any name. */
  async function pickModel(name: string) {
    fireEvent.click(modelRow());
    fireEvent.click(
      await screen.findByRole('button', { name: 'Enter the name manually' }),
    );
    type('Model name', name);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Model name')).toBeNull(),
    );
  }

  it('env: read-only rows, no Save and no Turn off', async () => {
    server(() => [{ ...gemini, savedInactive: true, rev: 2 }]);
    await wrap(<AiProviderScreen />);
    expect(
      await screen.findByText('Settings come from .env and take priority'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Settings saved here are inactive while AI_* variables are set',
      ),
    ).toBeTruthy();
    // Only the refine limit, which env does not set (ADR-0020 §6).
    expect(screen.getAllByRole('textbox')).toEqual([
      field('Refinements per meal per visit'),
    ]);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Turn off AI/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Provider/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check now' })).toBeTruthy();
  });

  it('unchanged: one «Check now»; an edit brings «Check» and «Save»', async () => {
    server(() => [saved]);
    await wrap(<AiProviderScreen />);
    await screen.findByText('Set · …a3F9');
    expect(screen.getByRole('button', { name: 'Check now' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    await pickModel('gemini-3.8-pro');
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByText('Gemini free tier')).toBeTruthy();
  });

  it('«Save anyway» only after ai_check_failed, gone on an edit', async () => {
    const calls = server(({ method, body }) =>
      method === 'PUT' && !(body as { force?: boolean }).force
        ? [
            {
              error: {
                code: 'ai_check_failed',
                details: {
                  state: 'unavailable',
                  details: { status: 503, message: 'Service Unavailable' },
                },
              },
            },
            422,
          ]
        : method === 'PUT'
          ? [{ ...saved, model: 'gemini-3.8-pro', state: 'unknown', rev: 4 }]
          : [saved],
    );
    await wrap(<AiProviderScreen />);
    await screen.findByText('Set · …a3F9');
    await pickModel('gemini-3.8-pro');
    expect(screen.queryByRole('button', { name: 'Save anyway' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Not saved: Provider unavailable'),
    ).toBeTruthy();
    expect(calls.at(-1)?.body).toEqual({
      provider: 'google',
      model: 'gemini-3.8-pro',
      rev: 3,
    });

    await pickModel('gemini-3.8-pro ');
    expect(screen.queryByRole('button', { name: 'Save anyway' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save anyway' }));
    await screen.findByText('Saved. The new model is already in use');
    expect(calls.at(-1)?.body).toEqual({
      provider: 'google',
      model: 'gemini-3.8-pro',
      rev: 3,
      force: true,
    });
  });

  it('after saving, the key is nowhere in the DOM, only its last 4', async () => {
    const key = 'sk-proj-secret-9xQ2';
    const calls = server(({ method }) =>
      method === 'PUT'
        ? [
            {
              ...saved,
              provider: 'openai',
              providerName: 'OpenAI',
              model: 'gpt-5-mini',
              keyLast4: '9xQ2',
            },
          ]
        : [off],
    );
    await wrap(<AiProviderScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /Provider/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }));
    type('API key', key);
    await pickModel('gpt-5-mini');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Set · …9xQ2');
    expect(calls.at(-1)).toMatchObject({
      method: 'PUT',
      body: { provider: 'openai', apiKey: key, rev: null },
    });
    expect(document.body.innerHTML).not.toContain(key);
    for (const input of document.querySelectorAll('input'))
      expect(input.value).not.toContain(key);
  });

  it('another provider clears the key and asks for its own', async () => {
    server(() => [saved]);
    await wrap(<AiProviderScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /Provider/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Anthropic' }));
    expect(field('API key').value).toBe('');
    expect(modelRow().textContent).toContain('Choose a model');
    expect(
      screen.getByText('Anthropic needs its own key — the old one won’t work'),
    ).toBeTruthy();
    expect(screen.queryByText('Gemini free tier')).toBeNull();
  });

  it('first setup: buttons stay active, a tap names and focuses the empty field', async () => {
    const calls = server(() => [off]);
    await wrap(<AiProviderScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /Provider/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Ollama|compatible/i }));
    const save = screen.getByRole('button', {
      name: 'Save',
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(screen.getByText('Enter an address')).toBeTruthy();
    expect(screen.getByText('Enter a model')).toBeTruthy();
    expect(document.activeElement).toBe(field('Address'));
    type('Address', 'http://ollama:11434/v1');
    expect(screen.queryByText('Enter an address')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(document.activeElement).toBe(modelRow());
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('own server: a model change alone saves without the address', async () => {
    const ollama: AdminAiStatus = {
      ...saved,
      provider: 'openai-compatible',
      providerName: null,
      model: 'llava',
      keySet: false,
      keyLast4: null,
      baseUrlHost: 'ollama:11434',
    };
    const calls = server(({ method }) =>
      method === 'PUT' ? [{ ...ollama, model: 'qwen2.5vl', rev: 4 }] : [ollama],
    );
    await wrap(<AiProviderScreen />);
    expect(
      await screen.findByText('Saved: ollama:11434. Leave empty to keep it'),
    ).toBeTruthy();
    expect(field('Address').value).toBe('');
    expect(field('Address').placeholder).toBe('Unchanged');
    await pickModel('qwen2.5vl');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved. The new model is already in use');
    expect(calls.at(-1)?.body).toEqual({
      provider: 'openai-compatible',
      model: 'qwen2.5vl',
      rev: 3,
    });
  });

  it('own server: a new address opens the key field, the saved key stays behind', async () => {
    server(() => [
      {
        ...saved,
        provider: 'openai-compatible',
        providerName: null,
        baseUrlHost: 'ollama:11434',
      },
    ]);
    await wrap(<AiProviderScreen />);
    await screen.findByRole('button', { name: 'Replace key' });
    expect(screen.queryByLabelText('API key')).toBeNull();
    type('Address', 'http://other:11434/v1');
    expect(field('API key').value).toBe('');
    expect(screen.queryByRole('button', { name: 'Replace key' })).toBeNull();
    screen.getByText(
      'The saved key only goes to ollama:11434. If the new address needs a key, enter it',
    );
  });

  it('the eye in the key field says «key»', async () => {
    server(() => [saved]);
    await wrap(<AiProviderScreen />);
    await screen.findByText('Set · …a3F9');
    fireEvent.click(screen.getByRole('button', { name: 'Replace key' }));
    expect(screen.getByRole('button', { name: 'Show key' })).toBeTruthy();
  });

  it('a draft check that fails shows the state, nothing is saved', async () => {
    const calls = server(({ method }) =>
      method === 'POST'
        ? [{ state: 'model_not_found', checkedAt: 1 }]
        : [saved],
    );
    await wrap(<AiProviderScreen />);
    await screen.findByText('Set · …a3F9');
    await pickModel('gemini-9');
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Model not found')).toBeTruthy();
    expect(calls.at(-1)?.body).toEqual({
      provider: 'google',
      model: 'gemini-9',
    });
  });

  it('409 ai_settings_changed: «changed in another window», Reload re-reads', async () => {
    const calls = server(({ method }) =>
      method === 'PUT'
        ? [{ error: { code: 'ai_settings_changed' } }, 409]
        : [saved],
    );
    await wrap(<AiProviderScreen />);
    await screen.findByText('Set · …a3F9');
    await pickModel('gemini-3.8-pro');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(
        'Settings were changed in another window. Reload the page',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(modelRow().textContent).toContain(saved.model));
    expect(calls.at(-1)?.method).toBe('GET');
  });

  it('a typed key fetches the list after a pause and on leaving the field, never stored', async () => {
    const key = 'sk-proj-secret-9xQ2';
    const calls = server(() => [off]);
    await wrap(<AiProviderScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /Provider/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }));
    type('API key', key);
    const models = () => calls.filter((c) => c.url.endsWith('/models'));
    expect(models()).toHaveLength(0);
    await waitFor(() => expect(models()).toHaveLength(1));
    expect(models()[0]).toMatchObject({
      method: 'POST',
      body: { provider: 'openai', apiKey: key },
    });
    fireEvent.blur(field('API key'));
    expect(models()).toHaveLength(1);
    type('API key', `${key}0`);
    fireEvent.blur(field('API key'));
    expect(models()).toHaveLength(2);
    // Leaving the field during the pause fetched already: the timer must not fetch again.
    await new Promise((r) => setTimeout(r, 700));
    expect(models()).toHaveLength(2);
    for (const storage of [localStorage, sessionStorage])
      for (let i = 0; i < storage.length; i++)
        expect(storage.getItem(storage.key(i)!)).not.toContain(key);
    expect(JSON.stringify(history.state)).not.toContain(key);
  });

  it('picking from the list: the photo label and the warning come from it', async () => {
    server(() => [saved]);
    await wrap(<AiProviderScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /^Model/ }));
    expect(
      await screen.findByRole('radiogroup', { name: 'No photos' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /gemma-4-2b-it/ }));
    expect(modelRow().textContent).toContain('gemma-4-2b-itno photo');
    expect(
      screen.getByText(
        'This model doesn’t accept photos — photo recognition will be off; the goal assistant still works',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('the list fails: the reason and manual entry at once', async () => {
    server(
      () => [saved],
      [
        {
          error: {
            code: 'ai_models_failed',
            details: { state: 'auth_error', details: { status: 401 } },
          },
        },
        502,
      ],
    );
    await wrap(<AiProviderScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /^Model/ }));
    expect(
      await screen.findByText(
        'Couldn’t load the model list: the provider rejected the key. Enter the model name manually',
      ),
    ).toBeTruthy();
    type('Model name', 'gemini-9');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(modelRow().textContent).toContain('gemini-9'));
  });

  it('the saved key can’t be read: the key field says so', async () => {
    server(() => [
      {
        ...saved,
        source: null,
        keySet: false,
        keyLast4: null,
        keyUnreadable: true,
        state: 'not_configured',
      },
    ]);
    await wrap(<AiProviderScreen />);
    expect(
      await screen.findByText('The saved key can’t be read — enter it again'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('«Turn off AI» asks first, then deletes', async () => {
    const calls = server(({ method }) => [method === 'DELETE' ? off : saved]);
    await wrap(<AiProviderScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off AI' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(await screen.findByText('AI turned off')).toBeTruthy();
    expect(calls.at(-1)).toMatchObject({
      method: 'DELETE',
      url: '/api/admin/ai/settings',
    });
  });

  it('refine limit: saved on blur, also with env; only 1..50, empty is no limit', async () => {
    const calls = server((c) =>
      c.method === 'PUT'
        ? [
            {
              ...gemini,
              refineLimit: (c.body as { limit: number | null }).limit,
            },
          ]
        : [gemini],
    );
    await wrap(<AiProviderScreen />);
    await screen.findByText('Settings come from .env and take priority');
    const name = 'Refinements per meal per visit';
    expect(
      screen.getByText(
        'How many times one meal can be refined or recognized again while it is open. Empty — no limit.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'AI refinements' }),
    ).toBeTruthy();
    for (const bad of ['0', '51', '2.5', 'x']) {
      type(name, bad);
      fireEvent.blur(field(name));
      expect(
        screen.getByText('A whole number from 1 to 50, or empty'),
      ).toBeTruthy();
      expect(field(name).getAttribute('aria-invalid')).toBe('true');
    }
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);

    type(name, ' 3 ');
    fireEvent.blur(field(name));
    expect(await screen.findByText('Refinement limit saved')).toBeTruthy();
    // Unchanged: no second request.
    fireEvent.blur(field(name));
    type(name, '');
    fireEvent.submit(field(name).form!);
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'PUT')).toEqual([
        {
          method: 'PUT',
          url: '/api/admin/ai/refine-limit',
          body: { limit: 3 },
        },
        {
          method: 'PUT',
          url: '/api/admin/ai/refine-limit',
          body: { limit: null },
        },
      ]),
    );
  });

  describe('«Allow personal API keys»', () => {
    const allow = () =>
      screen.findByRole('switch', { name: 'Allow personal API keys' });
    const puts = (calls: Call[]) =>
      calls.filter((c) => c.url === '/api/admin/ai/user-keys');

    it('off with saved keys asks first and names how many are deleted', async () => {
      const calls = server(({ method }) => [
        method === 'PUT' ? { deleted: 3 } : { ...saved, userKeyCount: 3 },
      ]);
      await wrap(<AiProviderScreen />);
      fireEvent.click(await allow());
      expect(screen.getByRole('heading', { name: 'Users' })).toBeTruthy();
      expect(
        screen.getByText(
          'Keys of 3 people will be deleted; they’ll switch to server AI.',
        ),
      ).toBeTruthy();
      expect(puts(calls)).toHaveLength(0);
      fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
      await waitFor(async () =>
        expect((await allow()).getAttribute('aria-checked')).toBe('false'),
      );
      expect(puts(calls)).toEqual([
        {
          method: 'PUT',
          url: '/api/admin/ai/user-keys',
          body: { allow: false },
        },
      ]);
    });

    it.each([
      [1, 'Ключ 1 пользователя удалится, он перейдёт на ИИ сервера.'],
      [21, 'Ключи 21 пользователя удалятся, они перейдут на ИИ сервера.'],
    ])('ru: the confirm text for %i key(s)', async (count, text) => {
      localStorage.setItem(LOCALE_STORAGE_KEY, 'ru');
      server(() => [{ ...saved, userKeyCount: count }]);
      await wrap(<AiProviderScreen />);
      fireEvent.click(
        await screen.findByRole('switch', { name: 'Разрешить свой API-ключ' }),
      );
      expect(await screen.findByText(text)).toBeTruthy();
    });

    it('off without saved keys switches at once; on again too', async () => {
      const calls = server(({ method }) => [
        method === 'PUT' ? { deleted: 0 } : saved,
      ]);
      await wrap(<AiProviderScreen />);
      fireEvent.click(await allow());
      await waitFor(async () =>
        expect((await allow()).getAttribute('aria-checked')).toBe('false'),
      );
      expect(screen.queryByText('Turn off personal keys?')).toBeNull();
      fireEvent.click(await allow());
      await waitFor(() =>
        expect(puts(calls).map((c) => c.body)).toEqual([
          { allow: false },
          { allow: true },
        ]),
      );
    });

    it('ALLOW_USER_AI_KEYS in env: the switch is locked and says why', async () => {
      server(() => [{ ...saved, allowUserKeys: false, userKeysLocked: true }]);
      await wrap(<AiProviderScreen />);
      const sw = await allow();
      expect((sw as HTMLButtonElement).disabled).toBe(true);
      expect(sw.getAttribute('aria-checked')).toBe('false');
      expect(screen.getByText('Set in .env (ALLOW_USER_AI_KEYS)')).toBeTruthy();
    });
  });

  describe('ChatGPT subscription (OCT-178 §3)', () => {
    const START = 'https://auth.openai.com/api/accounts/authorize?state=s1';
    const CALLBACK = 'http://127.0.0.1:1459/auth/callback?code=c&state=s1';
    const signIn = { accountLabel: 'admin@example.com', signedInAt: 0 };
    const sub: AdminAiStatus = {
      ...saved,
      provider: 'chatgpt',
      providerName: 'ChatGPT',
      model: 'gpt-5.4',
      keySet: false,
      keyLast4: null,
      chatgpt: signIn,
    };
    const urls = (calls: Call[]) =>
      calls.filter((c) => c.url.includes('/chatgpt')).map((c) => c.url);

    it('pick → sign in → paste the address → connected; a wrong address says so first', async () => {
      let signedIn = false;
      const calls = server(({ url }) =>
        url.endsWith('/chatgpt/start')
          ? [{ url: START }]
          : url.endsWith('/chatgpt/finish')
            ? ((signedIn = true), [signIn])
            : [{ ...saved, chatgpt: signedIn ? signIn : null }],
      );
      await wrap(<AiProviderScreen />);
      fireEvent.click(await screen.findByRole('button', { name: /Provider/ }));
      fireEvent.click(
        screen.getByRole('radio', { name: /ChatGPT subscription/ }),
      );
      expect(screen.getByText('Not connected')).toBeTruthy();
      expect(screen.queryByLabelText('API key')).toBeNull();
      expect(screen.getByText('One limit for everyone')).toBeTruthy();

      fireEvent.click(
        screen.getByRole('button', { name: 'Sign in to ChatGPT' }),
      );
      const open = await screen.findByRole('link', {
        name: 'Open sign-in page',
      });
      expect(open.getAttribute('href')).toBe(START);
      type('Paste the address from the browser', 'https://example.com/');
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
      expect(
        await screen.findByText(/This isn’t the address after sign-in/),
      ).toBeTruthy();
      expect(urls(calls)).toEqual(['/api/admin/ai/chatgpt/start']);

      type('Paste the address from the browser', CALLBACK);
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
      expect(await screen.findByText('ChatGPT connected')).toBeTruthy();
      expect(await screen.findByText('admin@example.com')).toBeTruthy();
      expect(calls.find((c) => c.url.endsWith('/finish'))!.body).toEqual({
        callbackUrl: CALLBACK,
      });
      // The unsaved pick survives the reload of the sign-in.
      expect(screen.getByText('ChatGPT subscription')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    });

    it('a refused address keeps the sheet open with the reason and a new attempt', async () => {
      const calls = server(({ url }) =>
        url.endsWith('/chatgpt/start')
          ? [{ url: START }]
          : url.endsWith('/chatgpt/finish')
            ? [{ error: { code: 'chatgpt_state_invalid' } }, 400]
            : [{ ...sub, chatgpt: null }],
      );
      await wrap(<AiProviderScreen />);
      fireEvent.click(
        await screen.findByRole('button', { name: 'Sign in to ChatGPT' }),
      );
      await screen.findByRole('link', { name: 'Open sign-in page' });
      type('Paste the address from the browser', CALLBACK);
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
      expect(
        await screen.findByText(/This sign-in address is old or already used/),
      ).toBeTruthy();
      await waitFor(() =>
        expect(urls(calls)).toEqual([
          '/api/admin/ai/chatgpt/start',
          '/api/admin/ai/chatgpt/finish',
          '/api/admin/ai/chatgpt/start',
        ]),
      );
    });

    it('signed in: account, «Sign in again» and «Disconnect» with a confirm', async () => {
      const calls = server(({ method }) => [method === 'DELETE' ? null : sub]);
      await wrap(<AiProviderScreen />);
      expect(await screen.findByText('admin@example.com')).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Sign in again' }),
      ).toBeTruthy();
      fireEvent.click(
        screen.getByRole('button', { name: 'Disconnect subscription' }),
      );
      expect(urls(calls)).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
      await waitFor(() =>
        expect(
          calls.filter((c) => c.method === 'DELETE').map((c) => c.url),
        ).toEqual(['/api/admin/ai/chatgpt']),
      );
      expect(await screen.findByText('Subscription disconnected')).toBeTruthy();
    });

    it('AI_PROVIDER=chatgpt in env still shows the sign-in', async () => {
      server(() => [{ ...sub, source: 'env', rev: null, chatgpt: null }]);
      await wrap(<AiProviderScreen />);
      expect(
        await screen.findByRole('button', { name: 'Sign in to ChatGPT' }),
      ).toBeTruthy();
    });

    it('expired sign-in, plan not allowed and the used-up limit have their own words', async () => {
      await wrap(status({ ...sub, state: 'auth_error' }));
      expect(screen.getByText('ChatGPT sign-in expired')).toBeTruthy();
      expect(
        screen.getByText(
          'Sign in again. Until then, people log food manually.',
        ),
      ).toBeTruthy();
      cleanup();
      await wrap(
        status({
          ...sub,
          state: 'auth_error',
          details: { status: 403, reason: 'plan_not_allowed' },
        }),
      );
      expect(screen.getByText(/doesn’t allow apps/)).toBeTruthy();
      cleanup();
      await wrap(status({ ...sub, state: 'quota_exceeded' }));
      expect(screen.getByText('Subscription limit used up')).toBeTruthy();
      expect(
        screen
          .getByRole('link', { name: /App usage limit/ })
          .getAttribute('href'),
      ).toBe('https://chatgpt.com/#settings');
    });
  });
});
