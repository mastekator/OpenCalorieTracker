import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type {
  AiConsentsResponse,
  AiStatus,
  MeResponse,
  OwnAi,
} from '@oct/shared';
import { readConsents } from '../../data/aiConsents';
import { readDeviceAi } from '../../data/deviceAi';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { AiScreen } from './AiScreen';

const user = { id: 5, role: 'user', locale: 'en' } as MeResponse;
const OWN = 'openai-compatible:llm.example.com:8080';
const CONSENTS: AiConsentsResponse = {
  consents: [
    { providerKey: 'google', grantedAt: Date.UTC(2026, 10, 1) },
    { providerKey: OWN, grantedAt: Date.UTC(2026, 10, 2) },
  ],
  server: {
    providerKey: 'google',
    provider: 'google',
    host: null,
    local: false,
  },
};

type Call = { url: string; method: string; body?: unknown };
const STATUS: AiStatus = {
  recognition: 'ready',
  interview: 'ready',
  providerName: 'Google Gemini',
  baseUrlHost: null,
  refineLimit: null,
  userKeysDisabledNotice: false,
};

/** /api/ai/own* answers; any other call goes to the consents mock. */
type OwnAnswer = (call: Call) => [unknown, number?];
const noKey: OwnAnswer = () => [null];
const status = (s: Partial<AiStatus> = {}) => ({ ...STATUS, ...s });

function serve(
  body: AiConsentsResponse,
  deleteStatus = 204,
  own: OwnAnswer = noKey,
  aiStatus: AiStatus = STATUS,
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const url = String(input);
      if (url === '/api/ai/status') return Response.json(aiStatus);
      if (url.startsWith('/api/ai/own')) {
        const call = {
          url,
          method,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        };
        ownCalls.push(call);
        const [answer, code = 200] = own(call);
        return Response.json(answer, { status: code });
      }
      calls.push({ url, method });
      if (method === 'DELETE')
        return deleteStatus === 204
          ? new Response(null, { status: 204 })
          : Response.json(
              { error: { code: 'internal', message: 'x' } },
              { status: deleteStatus },
            );
      return Response.json(body);
    }),
  );
  return calls;
}

let ownCalls: Call[] = [];

const wrap = () =>
  render(
    <I18nProvider>
      <ToastProvider>
        <AiScreen user={user} />
      </ToastProvider>
    </I18nProvider>,
  );

async function revoke(name: string) {
  fireEvent.click(
    await screen.findByRole('button', { name: `Revoke ${name}` }),
  );
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(`Revoke consent for ${name}?`)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));
}

beforeEach(() => {
  ownCalls = [];
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AiScreen (OCT-178 §1)', () => {
  it('revoke: DELETE with the encoded key, the row goes, the copy follows', async () => {
    const calls = serve(CONSENTS);
    wrap();
    await revoke('llm.example.com:8080');
    expect(await screen.findByText('Consent revoked')).toBeTruthy();
    expect(calls.at(-1)).toEqual({
      url: `/api/ai/consents/${encodeURIComponent(OWN)}`,
      method: 'DELETE',
    });
    expect(screen.queryByText('llm.example.com:8080')).toBeNull();
    expect(screen.getByText('Google Gemini')).toBeTruthy();
    expect(readConsents(user.id)?.consents.map((c) => c.providerKey)).toEqual([
      'google',
    ]);
  });

  it('revoke moves focus to the next «Revoke», then to the group title', async () => {
    serve(CONSENTS);
    wrap();
    await revoke('Google Gemini');
    await screen.findByText('Consent revoked');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Revoke llm.example.com:8080' }),
    );
    await revoke('llm.example.com:8080');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Consents' }),
      ),
    );
  });

  it('a failed DELETE keeps the row and the copy', async () => {
    serve(CONSENTS, 500);
    wrap();
    await revoke('Google Gemini');
    expect(await screen.findByText(/Something went wrong/)).toBeTruthy();
    expect(screen.getByText('Google Gemini')).toBeTruthy();
    expect(readConsents(user.id)?.consents).toHaveLength(2);
  });

  it('a local server model: a row without «Revoke»; no consents: the empty line', async () => {
    serve({
      consents: [],
      server: {
        providerKey: 'openai-compatible:192.168.1.20',
        provider: 'openai-compatible',
        host: '192.168.1.20',
        local: true,
      },
    });
    wrap();
    expect(await screen.findByText('Local model 192.168.1.20')).toBeTruthy();
    expect(screen.getByText('Your data stays on your network')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Revoke/ })).toBeNull();
    cleanup();
    serve({ consents: [], server: null });
    wrap();
    expect(
      await screen.findByText(/You haven’t allowed any provider yet/),
    ).toBeTruthy();
  });

  it('offline: the copy, the note, «Revoke» answers with a toast; the switch works', async () => {
    serve(CONSENTS);
    wrap();
    await screen.findByText('Google Gemini');
    cleanup();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const calls = serve(CONSENTS);
    wrap();
    expect(
      await screen.findByText(/revoking consent needs a connection/),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Revoke Google Gemini' }),
    );
    expect(await screen.findByText('Needs a connection')).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: 'AI on this device' }));
    expect(readDeviceAi(user.id)).toBe(false);
    expect(screen.getByText('AI is off on this device')).toBeTruthy();
    await waitFor(() => expect(calls).toEqual([]));
  });
});

describe('AiScreen: own API key (OCT-178 §2–4)', () => {
  const KEY = 'sk-proj-secret-9xQ2';
  const SAVED: NonNullable<OwnAi> = {
    provider: 'openai',
    model: 'gpt-5-mini',
    baseUrl: null,
    keyLast4: '9xQ2',
    keyUnreadable: false,
    state: 'ok',
    checkedAt: Date.UTC(2026, 10, 27),
  };
  const failed = (code: string, details?: unknown): [unknown, number] => [
    { error: { code, message: 'x', details } },
    code === 'ai_check_failed'
      ? 422
      : code === 'ai_base_url_private'
        ? 400
        : 403,
  ];
  const field = (name: string) =>
    screen.getByLabelText(name) as HTMLInputElement;
  const type = (name: string, value: string) =>
    fireEvent.change(field(name), { target: { value } });

  /** Own key, OpenAI, a key and a model typed in by hand. */
  async function fillForm() {
    fireEvent.click(
      await screen.findByRole('radio', { name: /My own API key/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Provider/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }));
    type('API key', KEY);
    fireEvent.click(screen.getByRole('button', { name: /^Model/ }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Enter the name manually' }),
    );
    type('Model name', 'gpt-5-mini');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Model name')).toBeNull(),
    );
  }

  it('saves after a passing check: PUT with the draft, then only the last 4', async () => {
    serve(CONSENTS, 204, ({ method, url }) =>
      url.endsWith('/models')
        ? [{ models: [] }]
        : method === 'PUT'
          ? [SAVED]
          : [null],
    );
    wrap();
    expect(
      (await screen.findByRole('radio', { name: /Through the server/ }))
        .ariaChecked,
    ).toBe('true');
    await fillForm();
    // Saving is the check: no separate «Check» for a draft.
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Key saved. AI now uses your key'),
    ).toBeTruthy();
    expect(ownCalls.find((c) => c.method === 'PUT')?.body).toEqual({
      provider: 'openai',
      model: 'gpt-5-mini',
      apiKey: KEY,
    });
    expect(screen.getByText('Set · …9xQ2')).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: /My own API key/ }).ariaChecked,
    ).toBe('true');
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it('422: «Not saved», no «Save anyway», nothing stored', async () => {
    serve(CONSENTS, 204, ({ method, url }) =>
      url.endsWith('/models')
        ? [{ models: [] }]
        : method === 'PUT'
          ? failed('ai_check_failed', {
              state: 'auth_error',
              details: { status: 401 },
            })
          : [null],
    );
    wrap();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Not saved: Key or access error'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save anyway' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete key' })).toBeNull();
    expect(localStorage.getItem(`oct.ownAi.${user.id}`)).toBe('null');
  });

  it('400 ai_base_url_private shows at the address field', async () => {
    serve(CONSENTS, 204, ({ method, url }) =>
      url.endsWith('/models')
        ? [{ models: [] }]
        : method === 'PUT'
          ? failed('ai_base_url_private')
          : [null],
    );
    wrap();
    fireEvent.click(
      await screen.findByRole('radio', { name: /My own API key/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Provider/ }));
    fireEvent.click(screen.getByRole('radio', { name: /^OpenAI-compatible/ }));
    type('Address', 'https://10.0.0.5/v1');
    fireEvent.click(screen.getByRole('button', { name: /^Model/ }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Enter the name manually' }),
    );
    type('Model name', 'llama');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Model name')).toBeNull(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(field('Address').getAttribute('aria-invalid')).toBe('true'),
    );
  });

  it('delete: confirm, DELETE, back to «Through the server»', async () => {
    serve(CONSENTS, 204, ({ method }) =>
      method === 'DELETE' ? [null] : [SAVED],
    );
    wrap();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete key' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(
      await screen.findByText('Key deleted. AI works through the server'),
    ).toBeTruthy();
    expect(ownCalls.at(-1)?.method).toBe('DELETE');
    expect(
      screen.getByRole('radio', { name: /Through the server/ }).ariaChecked,
    ).toBe('true');
    expect(screen.queryByText('Your key')).toBeNull();
  });

  it('403 on save: the banner, no «My own API key»', async () => {
    serve(CONSENTS, 204, ({ method, url }) =>
      url.endsWith('/models')
        ? [{ models: [] }]
        : method === 'PUT'
          ? failed('ai_user_keys_disabled')
          : [null],
    );
    wrap();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('The administrator turned off own API keys'),
    ).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /My own API key/ })).toBeNull();
    expect(screen.queryByText('Your key')).toBeNull();
  });

  it('the «keys turned off» notice; status is read before GET /api/ai/own clears it', async () => {
    serve(
      CONSENTS,
      204,
      () => failed('ai_user_keys_disabled'),
      status({ userKeysDisabledNotice: true }),
    );
    wrap();
    expect(
      await screen.findByText('The admin turned off personal keys'),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.queryByRole('radio', { name: /My own API key/ }),
      ).toBeNull(),
    );
  });
});
