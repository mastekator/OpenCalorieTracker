import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import type { MeResponse } from '@oct/shared';
import { api } from '../../api/client';
import { SessionContext } from '../../app/SessionContext';
import { hasConsent, readConsents } from '../../data/aiConsents';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { AiConsentProvider, useAiConsent } from './AiConsent';

const user = { id: 7 } as MeResponse;
const AI = '/api/ai/x';
const CONSENTS = '/api/ai/consents';
const details = {
  providerKey: 'google',
  provider: 'google',
  aiSource: 'server',
};
const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status });
const denied = () =>
  json(403, { error: { code: 'ai_consent_required', details } });

/** `ai` answers the AI calls in order; GET and POST /api/ai/consents are answered here. */
function serve(...ai: (() => Response)[]) {
  let calls = 0;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === CONSENTS)
      return init?.method === 'POST'
        ? json(204, null)
        : json(200, { consents: [], server: null });
    return ai[calls++]!();
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const aiCalls = (fetch: ReturnType<typeof serve>) =>
  fetch.mock.calls.filter(([url]) => url === AI).length;

/** A button that makes one AI call and shows how it ended. */
function Caller({ id }: { id: string }) {
  const withConsent = useAiConsent();
  const [result, setResult] = useState('');
  return (
    <>
      <button
        type="button"
        onClick={() =>
          withConsent('photo', () => api(AI, z.object({ ok: z.boolean() })))
            .then(() => setResult('ok'))
            .catch((err: Error) => setResult(err.message))
        }
      >
        {`call ${id}`}
      </button>
      <output>{result && `${id}: ${result}`}</output>
    </>
  );
}

const wrap = (children: ReactNode) =>
  renderLoaded(
    <I18nProvider>
      <SessionContext.Provider
        value={{
          user,
          refresh: async () => {},
          signedIn: async () => {},
          logout: async () => {},
        }}
      >
        <AiConsentProvider>{children}</AiConsentProvider>
      </SessionContext.Provider>
    </I18nProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useAiConsent', () => {
  it('403 → the sheet → Allow → POST consent → the call repeats and succeeds', async () => {
    const fetch = serve(denied, () => json(200, { ok: true }));
    await wrap(<Caller id="a" />);
    fireEvent.click(screen.getByRole('button', { name: 'call a' }));
    expect(await screen.findByText('Send data to Google Gemini?')).toBeTruthy();
    expect(screen.getByText('Gemini free tier')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(await screen.findByText('a: ok')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      CONSENTS,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ providerKey: 'google' }),
      }),
    );
    expect(aiCalls(fetch)).toBe(2);
    expect(hasConsent(user.id, 'google')).toBe(true);
  });

  it('Not now → the 403 goes to the caller, no second AI call', async () => {
    const fetch = serve(denied, () => json(200, { ok: true }));
    await wrap(<Caller id="a" />);
    fireEvent.click(screen.getByRole('button', { name: 'call a' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(await screen.findByText('a: ai_consent_required')).toBeTruthy();
    expect(aiCalls(fetch)).toBe(1);
    expect(fetch).not.toHaveBeenCalledWith(
      CONSENTS,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('two calls that hit the 403 together share one sheet and one answer', async () => {
    const fetch = serve(
      denied,
      denied,
      () => json(200, { ok: true }),
      () => json(200, { ok: true }),
    );
    await wrap(
      <>
        <Caller id="a" />
        <Caller id="b" />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'call a' }));
    fireEvent.click(screen.getByRole('button', { name: 'call b' }));
    await waitFor(() => expect(aiCalls(fetch)).toBe(2));
    expect(
      await screen.findAllByRole('button', { name: 'Allow' }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(await screen.findByText('a: ok')).toBeTruthy();
    expect(await screen.findByText('b: ok')).toBeTruthy();
    expect(
      fetch.mock.calls.filter(
        ([url, init]) => url === CONSENTS && init?.method === 'POST',
      ),
    ).toHaveLength(1);
  });

  it('keeps a copy of the consents per user, loaded on start', async () => {
    serve();
    await act(() => wrap(null));
    await waitFor(() => expect(readConsents(user.id)).not.toBeNull());
    expect(readConsents(8)).toBeNull();
  });
});

describe('aiConsents copy', () => {
  it('reads an unreadable copy as none', () => {
    localStorage.setItem(`oct.aiConsents.${user.id}`, '{bad');
    expect(readConsents(user.id)).toBeNull();
    expect(hasConsent(user.id, 'google')).toBe(false);
  });
});
