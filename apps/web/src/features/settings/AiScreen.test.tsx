import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { AiConsentsResponse, MeResponse } from '@oct/shared';
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

type Call = { url: string; method: string };

function serve(body: AiConsentsResponse, deleteStatus = 204) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url: String(input), method });
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
