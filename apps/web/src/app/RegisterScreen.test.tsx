import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import * as webauthn from '@simplewebauthn/browser';
import type { ConfigResponse, MeResponse } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';
import { RegisterScreen, type RegisterKind } from './RegisterScreen';

vi.mock('@simplewebauthn/browser', () => ({ startRegistration: vi.fn() }));
const wa = vi.mocked(webauthn);

const config: ConfigResponse = {
  version: '0.1.0',
  apiVersion: 1,
  publicUrl: 'https://food.example.com',
  authMethods: ['passkey', 'password'],
  registration: 'invite',
  setupError: null,
};
const me: MeResponse = {
  id: 2,
  email: 'oleg@example.com',
  name: 'Oleg',
  role: 'user',
  locale: 'en',
  theme: 'system',
  units: 'metric',
  normDisclaimerHidden: false,
  passwordFromConfig: false,
  methods: ['password'],
};
const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1';
const TELEGRAM = 'Mozilla/5.0 (iPhone) Mobile/15E148 Telegram-iOS';
const valid = { kind: 'invite', email: 'anna@example.com', status: 'valid' };

type Reply = object | { code: string; status: number };

/** Each API path answers with a JSON body or an error; a list answers call by call. */
function serve(routes: Record<string, Reply | Reply[]>) {
  const fetch = vi.fn(async (path: string) => {
    const route = routes[path];
    const r = Array.isArray(route) ? route.shift() : route;
    if (r && 'code' in r)
      return Response.json({ error: { code: r.code } }, { status: r.status });
    return r
      ? Response.json(r)
      : Response.json({ error: { code: 'not_found' } }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function renderScreen(
  kind: RegisterKind = 'invite',
  props: Partial<Parameters<typeof RegisterScreen>[0]> = {},
) {
  const onSignedIn = vi.fn(async () => {});
  const onSignOut = vi.fn(async () => {});
  render(
    <I18nProvider>
      <RegisterScreen
        kind={kind}
        config={config}
        token="tok"
        user={null}
        onSignedIn={onSignedIn}
        onSignOut={onSignOut}
        userAgent={SAFARI}
        href="https://food.example.com/invite#tok"
        {...props}
      />
    </I18nProvider>,
  );
  return { onSignedIn, onSignOut };
}

async function fillPassword(password = 'Sunny-day42') {
  fireEvent.click(await screen.findByRole('radio', { name: 'Password' }));
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText('Repeat password'), {
    target: { value: password },
  });
}

const submit = (name = 'Create account') =>
  fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RegisterScreen: link state', () => {
  it.each([
    ['invite', 'expired', 'This invite has expired'],
    ['invite', 'used', 'This invite has already been used'],
    ['invite', 'invalid', 'This invite is no longer valid'],
    ['recovery', 'expired', 'This link has expired'],
  ] as const)('%s link %s: 2.4 «%s»', async (kind, status, title) => {
    serve({ '/api/auth/invites/check': { kind, email: null, status } });
    renderScreen(kind);
    expect(await screen.findByText(title)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'I already have an account — sign in' }),
    ).toBeTruthy();
  });

  it('shows 2.4 without asking the server when the URL has no token', async () => {
    const fetch = serve({});
    renderScreen('invite', { token: '' });
    expect(
      await screen.findByText('This invite is no longer valid'),
    ).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('signed in: 2.5, the link is not checked or used; sign-out goes on', async () => {
    const fetch = serve({});
    const { onSignOut } = renderScreen('invite', { user: me });
    expect(await screen.findByText('You’re signed in as Oleg')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Stay as Oleg' })).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign out and continue' }),
    );
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('RegisterScreen: form', () => {
  it('shows the invite form with the email locked and passkey first', async () => {
    serve({ '/api/auth/invites/check': valid });
    renderScreen();
    const email = (await screen.findByLabelText('Email')) as HTMLInputElement;
    expect(email.value).toBe('anna@example.com');
    expect(email.readOnly).toBe(true);
    expect(
      screen
        .getByRole('radio', { name: 'Passkey' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.getByRole('button', { name: 'Create passkey' })).toBeTruthy();
  });

  it('keeps what was typed through server errors (E-3.5)', async () => {
    const fetch = serve({
      '/api/auth/invites/check': valid,
      '/api/auth/register': [
        { code: 'password_too_common', status: 400 },
        { code: 'internal', status: 500 },
      ],
    });
    const { onSignedIn } = renderScreen();
    fireEvent.change(await screen.findByLabelText('Your name'), {
      target: { value: 'Anna' },
    });
    await fillPassword();
    submit();
    expect(
      await screen.findByText(
        'This password is too common. Choose another one.',
      ),
    ).toBeTruthy();
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe(
      'Anna',
    );

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Rainy-day42' },
    });
    fireEvent.change(screen.getByLabelText('Repeat password'), {
      target: { value: 'Rainy-day42' },
    });
    submit();
    expect(
      await screen.findByText('Something went wrong. Try again'),
    ).toBeTruthy();
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe(
      'Anna',
    );
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe(
      'Rainy-day42',
    );
    expect(onSignedIn).not.toHaveBeenCalled();
    const [, init] = fetch.mock.calls.at(-1) as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toMatchObject({
      token: 'tok',
      name: 'Anna',
      password: 'Rainy-day42',
    });
  });

  it('checks fields on submit without calling the server', async () => {
    const fetch = serve({ '/api/auth/invites/check': valid });
    renderScreen();
    await screen.findByLabelText('Your name');
    await fillPassword();
    fireEvent.change(screen.getByLabelText('Repeat password'), {
      target: { value: 'Other-day42' },
    });
    submit();
    expect(screen.getByText('Enter your name')).toBeTruthy();
    expect(screen.getByText('Passwords don’t match')).toBeTruthy();
    expect(fetch).toHaveBeenCalledOnce(); // only the link check
  });

  it('switches to 2.4 when the invite was used meanwhile', async () => {
    serve({
      '/api/auth/invites/check': valid,
      '/api/auth/register': { code: 'invite_used', status: 409 },
    });
    renderScreen();
    fireEvent.change(await screen.findByLabelText('Your name'), {
      target: { value: 'Anna' },
    });
    await fillPassword();
    submit();
    expect(
      await screen.findByText('This invite has already been used'),
    ).toBeTruthy();
  });

  it('registers a passkey and signs in; a cancelled dialog shows nothing', async () => {
    serve({
      '/api/auth/invites/check': valid,
      '/api/auth/register/passkey/options': { challengeId: 'c', options: {} },
      '/api/auth/register/passkey/verify': me,
    });
    const cancel = Object.assign(new Error('closed'), {
      name: 'NotAllowedError',
    });
    wa.startRegistration.mockRejectedValueOnce(cancel);
    wa.startRegistration.mockResolvedValueOnce({} as never);
    const { onSignedIn } = renderScreen();
    fireEvent.change(await screen.findByLabelText('Your name'), {
      target: { value: 'Anna' },
    });
    submit('Create passkey');
    await waitFor(() => expect(wa.startRegistration).toHaveBeenCalledOnce());
    expect(document.querySelector('.banner')).toBeNull();
    submit('Create passkey');
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
  });

  it('recovery: no name field, «New password» segment', async () => {
    serve({
      '/api/auth/invites/check': { ...valid, kind: 'recovery' },
      '/api/auth/recover': me,
    });
    const { onSignedIn } = renderScreen('recovery');
    expect(
      await screen.findByText(
        'For anna@example.com. Your diary and settings stay intact.',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Your name')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'New password' }));
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'Sunny-day42' },
    });
    fireEvent.change(screen.getByLabelText('Repeat password'), {
      target: { value: 'Sunny-day42' },
    });
    submit();
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
  });

  it('open registration: a taken email gets the neutral text (2.7)', async () => {
    serve({
      '/api/auth/register/passkey/options': {
        code: 'registration_failed',
        status: 409,
      },
    });
    renderScreen('open', { token: undefined });
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'anna@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Your name'), {
      target: { value: 'Anna' },
    });
    submit('Create passkey');
    expect(
      await screen.findByText('Couldn’t create an account with this email'),
    ).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(
      'anna@example.com',
    );
  });
});

describe('RegisterScreen: in-app browser (2.3)', () => {
  it('defaults to password and shows the link when the clipboard fails', async () => {
    serve({ '/api/auth/invites/check': valid });
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error())) },
    });
    renderScreen('invite', { userAgent: TELEGRAM });
    expect(await screen.findByText('Open this link in Safari')).toBeTruthy();
    expect(
      screen
        .getByRole('radio', { name: 'Password' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    const link = await screen.findByText('https://food.example.com/invite#tok');
    expect(link.closest('[role="status"]')).toBeTruthy();
  });

  it('without password sign-in shows only the banner and the copy button', async () => {
    serve({ '/api/auth/invites/check': valid });
    renderScreen('invite', {
      userAgent: TELEGRAM,
      config: { ...config, authMethods: ['passkey'] },
    });
    expect(await screen.findByText('Open this link in Safari')).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('names no browser outside iOS', async () => {
    serve({ '/api/auth/invites/check': valid });
    renderScreen('invite', {
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) Telegram-Android',
    });
    expect(
      await screen.findByText('Open this link in your browser'),
    ).toBeTruthy();
  });
});
