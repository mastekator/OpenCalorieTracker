import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import * as webauthn from '@simplewebauthn/browser';
import type { ConfigResponse } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';
import { loginLayout, LoginScreen, type Notice } from './LoginScreen';

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  browserSupportsWebAuthnAutofill: vi.fn(async () => false),
  startAuthentication: vi.fn(),
  WebAuthnAbortService: { cancelCeremony: vi.fn() },
}));
const wa = vi.mocked(webauthn);

const ORIGIN = 'https://food.example.com';
const config: ConfigResponse = {
  version: '0.1.0',
  apiVersion: 1,
  publicUrl: ORIGIN,
  authMethods: ['passkey', 'password'],
  registration: 'invite',
  setupError: null,
};

const me = {
  id: 1,
  email: 'anna@example.com',
  name: null,
  role: 'user',
  locale: 'en',
  theme: 'system',
  units: 'metric',
  passwordFromConfig: false,
  methods: ['password'],
};

/** Each API path answers with a JSON body, or an error code with its status. */
function serve(
  routes: Record<
    string,
    object | { code: string; status: number; details?: object }
  >,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      const r = routes[path];
      if (r && 'code' in r)
        return Response.json(
          { error: { code: r.code, details: r.details } },
          { status: r.status as number },
        );
      return r
        ? Response.json(r)
        : Response.json({ error: { code: 'not_found' } }, { status: 404 });
    }),
  );
}

function renderLogin(
  props: Partial<{
    config: ConfigResponse;
    notice: Notice;
    origin: string;
  }> = {},
) {
  const onSignedIn = vi.fn(async () => {});
  const view = render(
    <I18nProvider>
      <LoginScreen
        config={config}
        origin={ORIGIN}
        onSignedIn={onSignedIn}
        {...props}
      />
    </I18nProvider>,
  );
  return { onSignedIn, ...view };
}

async function submitPassword(password = 'wrong-pass1!') {
  fireEvent.change(await screen.findByLabelText('Email'), {
    target: { value: 'anna@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

const banners = () => document.querySelectorAll('.banner');

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  vi.clearAllMocks();
  wa.browserSupportsWebAuthn.mockReturnValue(true);
  wa.browserSupportsWebAuthnAutofill.mockResolvedValue(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('loginLayout', () => {
  it('shows both methods by default and registration only when open', () => {
    expect(loginLayout(config, ORIGIN)).toEqual({
      kind: 'form',
      passkey: true,
      password: true,
      register: false,
    });
    expect(
      loginLayout({ ...config, registration: 'open' }, ORIGIN),
    ).toMatchObject({ register: true });
  });

  it('follows AUTH_METHODS', () => {
    expect(
      loginLayout({ ...config, authMethods: ['password'] }, ORIGIN),
    ).toMatchObject({ passkey: false, password: true });
    expect(
      loginLayout({ ...config, authMethods: ['passkey'] }, ORIGIN),
    ).toMatchObject({ passkey: true, password: false });
  });

  it('puts a setup error first, even without PUBLIC_URL', () => {
    expect(
      loginLayout(
        { ...config, publicUrl: null, setupError: 'public_url_invalid' },
        ORIGIN,
      ),
    ).toEqual({ kind: 'setup_error', error: 'public_url_invalid' });
  });

  it('sends a visitor on another origin to PUBLIC_URL (AC-7.2)', () => {
    expect(loginLayout(config, 'http://192.168.1.5:3000')).toEqual({
      kind: 'wrong_origin',
      publicUrl: ORIGIN,
    });
    // A path in PUBLIC_URL doesn't change the origin.
    expect(
      loginLayout({ ...config, publicUrl: `${ORIGIN}/` }, ORIGIN).kind,
    ).toBe('form');
  });
});

describe('LoginScreen', () => {
  it('signs in with the password', async () => {
    serve({ '/api/auth/login': me });
    const { onSignedIn } = renderLogin();
    await submitPassword('right-pass1!');
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
  });

  it('on wrong credentials keeps the email, clears and focuses the password (1.2)', async () => {
    serve({ '/api/auth/login': { code: 'invalid_credentials', status: 401 } });
    renderLogin();
    await submitPassword();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Incorrect email or password',
    );
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    expect(password.value).toBe('');
    expect(document.activeElement).toBe(password);
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(
      'anna@example.com',
    );
  });

  it('shows the timeout with minutes left and locks the password form (1.3)', async () => {
    serve({
      '/api/auth/login': {
        code: 'too_many_attempts',
        status: 429,
        details: { retryAfterSec: 150 },
      },
    });
    renderLogin();
    await submitPassword();
    await screen.findByText('Too many attempts');
    expect(screen.getByText(/reopens in 3 min/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Sign in with passkey',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it('counts the timeout down and reopens the form when it ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    renderLogin({ notice: { kind: 'timeout', until: Date.now() + 150_000 } });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText(/reopens in 3 min/)).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByText(/reopens in 2 min/)).toBeTruthy();
    // One act per tick: React re-renders, and so schedules the next tick, when act ends.
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByText(/reopens in 1 min/)).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.queryByText('Too many attempts')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it.each(['device_blocked', 'ip_blocked'])(
    'on %s hides the password form, passkey stays (1.4)',
    async (code) => {
      serve({ '/api/auth/login': { code, status: 429 } });
      renderLogin();
      await submitPassword();
      await screen.findByText('Password sign-in is blocked on this device');
      expect(screen.queryByLabelText('Password')).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Sign in with passkey' }),
      ).toBeTruthy();
    },
  );

  it('signs in with a passkey', async () => {
    serve({
      '/api/auth/passkey/login/options': { challengeId: 'c1', options: {} },
      '/api/auth/passkey/login/verify': me,
    });
    wa.startAuthentication.mockResolvedValue({ id: 'cred' } as never);
    const { onSignedIn } = renderLogin();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Sign in with passkey' }),
    );
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(wa.startAuthentication).toHaveBeenCalledWith({
      optionsJSON: {},
      useBrowserAutofill: false,
    });
  });

  it('says nothing when the user cancels the passkey dialog (E-5.1)', async () => {
    serve({
      '/api/auth/passkey/login/options': { challengeId: 'c1', options: {} },
    });
    wa.startAuthentication.mockRejectedValue(
      Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }),
    );
    renderLogin();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Sign in with passkey' }),
    );
    await waitFor(() => expect(wa.startAuthentication).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(banners()).toHaveLength(0);
  });

  it('says the passkey no longer works when the server doesn’t know it (1.5)', async () => {
    serve({
      '/api/auth/passkey/login/options': { challengeId: 'c1', options: {} },
      '/api/auth/passkey/login/verify': {
        code: 'passkey_unknown',
        status: 401,
      },
    });
    wa.startAuthentication.mockResolvedValue({ id: 'cred' } as never);
    renderLogin();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Sign in with passkey' }),
    );
    expect(
      await screen.findByText(
        'This passkey no longer works. Sign in another way.',
      ),
    ).toBeTruthy();
  });

  it('says there is no passkey when the browser has no WebAuthn (1.5)', async () => {
    wa.browserSupportsWebAuthn.mockReturnValue(false);
    renderLogin({ config: { ...config, authMethods: ['passkey'] } });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Sign in with passkey' }),
    );
    expect(screen.getByText('No passkey on this device')).toBeTruthy();
    expect(screen.getByText(/ask your admin for a recovery link/)).toBeTruthy();
    expect(wa.startAuthentication).not.toHaveBeenCalled();
  });

  it('offers passkeys in autofill and aborts that request on unmount', async () => {
    serve({
      '/api/auth/passkey/login/options': { challengeId: 'c1', options: {} },
    });
    wa.browserSupportsWebAuthnAutofill.mockResolvedValue(true);
    wa.startAuthentication.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderLogin();
    await waitFor(() =>
      expect(wa.startAuthentication).toHaveBeenCalledWith({
        optionsJSON: {},
        useBrowserAutofill: true,
      }),
    );
    expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe(
      'username webauthn',
    );
    unmount();
    expect(wa.WebAuthnAbortService.cancelCeremony).toHaveBeenCalled();
  });

  it('never calls WebAuthn on another origin and links to PUBLIC_URL', async () => {
    wa.browserSupportsWebAuthnAutofill.mockResolvedValue(true);
    renderLogin({ origin: 'http://192.168.1.5:3000' });
    const link = await screen.findByRole('link', {
      name: 'Open food.example.com',
    });
    expect(link.getAttribute('href')).toBe(ORIGIN);
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(wa.browserSupportsWebAuthnAutofill).not.toHaveBeenCalled();
    expect(wa.startAuthentication).not.toHaveBeenCalled();
  });

  it('shows the setup error instead of the form (1.8)', async () => {
    renderLogin({ config: { ...config, setupError: 'admin_missing' } });
    expect(await screen.findByText('Installation isn’t set up')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('disables the buttons offline but keeps the fields (1.9)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderLogin();
    expect(
      await screen.findByText('You need an internet connection to sign in'),
    ).toBeTruthy();
    for (const name of ['Sign in', 'Sign in with passkey'])
      expect(
        (screen.getByRole('button', { name }) as HTMLButtonElement).disabled,
      ).toBe(true);
    expect((screen.getByLabelText('Email') as HTMLInputElement).disabled).toBe(
      false,
    );
    vi.restoreAllMocks();
  });

  it('shows «Create account» only with open registration', async () => {
    renderLogin({ config: { ...config, registration: 'open' } });
    expect(
      (
        await screen.findByRole('link', { name: 'Create account' })
      ).getAttribute('href'),
    ).toBe('/register');
  });
});
