import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ConfigResponse } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';
import { formatCode, SetupScreen } from './SetupScreen';

const ORIGIN = 'https://food.example.com';
const config: ConfigResponse = {
  version: '0.2.0',
  apiVersion: 1,
  publicUrl: ORIGIN,
  authMethods: ['passkey', 'password'],
  registration: 'invite',
  setupError: null,
  setupRequired: true,
};

/** POST /api/setup/code answers 204, or an error code with its status. */
function serve(error?: { code: string; status: number; details?: object }) {
  const fetch = vi.fn(async () =>
    error
      ? Response.json(
          { error: { code: error.code, details: error.details } },
          { status: error.status },
        )
      : new Response(null, { status: 204 }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function renderSetup(
  props: Partial<{
    config: ConfigResponse;
    origin: string;
    onSignedIn: () => Promise<void>;
  }> = {},
) {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  return render(
    <I18nProvider>
      <SetupScreen
        config={config}
        origin={ORIGIN}
        onSignedIn={async () => {}}
        {...props}
      />
    </I18nProvider>,
  );
}

async function enter(code: string) {
  const field = await screen.findByLabelText('Setup code');
  fireEvent.change(field, { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  return field as HTMLInputElement;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('formatCode', () => {
  it('upper-cases, drops separators and puts the hyphen after 4', () => {
    expect(formatCode(' k7qm 3xrp ')).toBe('K7QM-3XRP');
    expect(formatCode('k7qm-3x')).toBe('K7QM-3X');
    expect(formatCode('K7QM-')).toBe('K7QM');
    expect(formatCode('K7QM3XRPZZ')).toBe('K7QM-3XRP');
  });
});

describe('setup step 1', () => {
  it('a short code is an error under the field without a request', async () => {
    const fetch = serve();
    renderSetup();
    await enter('K7QM-3X');
    expect(
      await screen.findByText('The code has 8 characters: XXXX-XXXX'),
    ).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a right code opens step 2 and is kept in memory only', async () => {
    const fetch = serve();
    renderSetup();
    await enter('k7qm3xrp');
    expect(
      await screen.findByRole('heading', { name: 'Admin account' }),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      '/api/setup/code',
      expect.objectContaining({ body: JSON.stringify({ code: 'K7QM-3XRP' }) }),
    );
    const stored = [localStorage, sessionStorage].flatMap((s) =>
      Object.keys(s).map((k) => `${k}=${s.getItem(k)}`),
    );
    expect(stored.join('\n')).not.toMatch(/K7QM/i);
    expect(location.href).not.toMatch(/K7QM/i);
  });

  it('setup_code_invalid: the error under the field, the code stays', async () => {
    serve({ code: 'setup_code_invalid', status: 400 });
    renderSetup();
    const field = await enter('K7QM-3XPR');
    expect(
      await screen.findByText('That code didn’t work. Check the container log'),
    ).toBeTruthy();
    expect(field.value).toBe('K7QM-3XPR');
    expect(field.getAttribute('aria-invalid')).toBe('true');
  });

  it('too_many_attempts: the timeout banner, the button off', async () => {
    serve({
      code: 'too_many_attempts',
      status: 429,
      details: { retryAfterSec: 14 * 60 },
    });
    renderSetup();
    await enter('K7QM-3XRP');
    expect(
      await screen.findByText('Code entry from this device reopens in 14 min.'),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it.each(['device_blocked', 'ip_blocked'])(
    '%s: the form is replaced by the reset-admin-access command',
    async (code) => {
      serve({ code, status: 403 });
      renderSetup();
      await enter('K7QM-3XRP');
      expect(
        await screen.findByText('Code entry from this device is blocked'),
      ).toBeTruthy();
      expect(screen.getByText(/reset-admin-access/)).toBeTruthy();
      expect(screen.queryByLabelText('Setup code')).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Enter a new code' }),
      ).toBeTruthy();
    },
  );

  it.each([
    ['setup_code_expired', 410, 'The code has expired'],
    ['setup_code_burned', 410, 'Too many wrong attempts'],
  ])(
    '%s: restart the container, then a new code',
    async (code, status, title) => {
      serve({ code, status });
      renderSetup();
      await enter('K7QM-3XRP');
      expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
      expect(document.querySelector('.command-line code')?.textContent).toBe(
        'docker compose restart opencalorietracker',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Enter a new code' }));
      expect(
        ((await screen.findByLabelText('Setup code')) as HTMLInputElement)
          .value,
      ).toBe('');
    },
  );

  it('setup_done: «Sign in» leads to sign-in', async () => {
    serve({ code: 'setup_done', status: 409 });
    renderSetup();
    await enter('K7QM-3XRP');
    expect(
      await screen.findByRole('heading', {
        name: 'Setup is already complete — sign in',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Sign in' }).getAttribute('href'),
    ).toBe('/login');
  });

  it('passkey only at another origin: the right address before the code', async () => {
    renderSetup({
      config: { ...config, authMethods: ['passkey'] },
      origin: 'http://192.168.1.5:3000',
    });
    expect(
      await screen.findByRole('link', { name: 'Open food.example.com' }),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Setup code')).toBeNull();
  });

  it('with password on, another origin still shows the code field', async () => {
    renderSetup({ origin: 'http://192.168.1.5:3000' });
    expect(await screen.findByLabelText('Setup code')).toBeTruthy();
  });

  it('the language toggle switches to Russian', async () => {
    renderSetup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'RU — switch to русский' }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Код установки')).toBeTruthy(),
    );
  });
});

const me = {
  id: 1,
  email: 'anna@example.com',
  name: 'Anna',
  role: 'admin',
  locale: 'en',
  theme: 'system',
  units: 'metric',
  normDisclaimerHidden: false,
  passwordFromConfig: false,
  methods: ['password'],
  enabledMethods: ['password', 'passkey'],
};

const PASSWORD = 'correct horse 7!';

/** Step 1 passes; POST /api/setup/admin answers `admin`; GET /api/admin/ai answers 500. */
function serveAdmin(admin: { code: string; status: number } | null) {
  const fetch = vi.fn(async (path: string) =>
    path === '/api/setup/code'
      ? new Response(null, { status: 204 })
      : path === '/api/setup/admin'
        ? admin
          ? Response.json(
              { error: { code: admin.code } },
              { status: admin.status },
            )
          : Response.json(me)
        : Response.json({ error: { code: 'internal' } }, { status: 500 }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/** Enters the code, then fills step 2 with a password and submits. */
async function createAdmin(onSignedIn = vi.fn(async () => {})) {
  renderSetup({ config: { ...config, authMethods: ['password'] }, onSignedIn });
  await enter('K7QM-3XRP');
  fireEvent.change(await screen.findByLabelText('Email'), {
    target: { value: 'anna@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Your name'), {
    target: { value: 'Anna' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: PASSWORD },
  });
  fireEvent.change(screen.getByLabelText('Repeat password'), {
    target: { value: PASSWORD },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  return onSignedIn;
}

describe('setup step 2 and 3', () => {
  it('sends the code in the body of /setup/admin, signs in and shows step 3', async () => {
    const fetch = serveAdmin(null);
    const onSignedIn = await createAdmin();
    expect(
      await screen.findByRole('heading', {
        name: 'All set — you’re the admin',
      }),
    ).toBeTruthy();
    expect(onSignedIn).toHaveBeenCalledOnce();
    const call = fetch.mock.calls.find(([p]) => p === '/api/setup/admin');
    expect(
      JSON.parse((call as unknown as [string, { body: string }])[1].body),
    ).toEqual({
      code: 'K7QM-3XRP',
      email: 'anna@example.com',
      name: 'Anna',
      locale: 'en',
      password: PASSWORD,
    });
    const stored = [localStorage, sessionStorage].flatMap((s) =>
      Object.keys(s).map((k) => `${k}=${s.getItem(k)}`),
    );
    expect(stored.join('\n')).not.toMatch(/K7QM/i);
    // The AI status didn't come: «Set up AI» anyway; invites open the new-invite sheet.
    expect(
      (await screen.findByRole('link', { name: 'Set up AI' })).getAttribute(
        'href',
      ),
    ).toBe('/settings/admin/ai');
    expect(
      screen.getByRole('link', { name: 'Invite' }).getAttribute('href'),
    ).toBe('/settings/admin/invites?new');
    expect(
      screen.getByRole('link', { name: 'Go to the app' }).getAttribute('href'),
    ).toBe('/');
  });

  it.each([
    ['setup_code_expired', 410, 'The code has expired'],
    ['setup_code_burned', 410, 'Too many wrong attempts'],
    ['setup_done', 409, 'Setup is already complete — sign in'],
  ])(
    '%s at step 2: the same end state as step 1',
    async (code, status, title) => {
      serveAdmin({ code, status });
      const onSignedIn = await createAdmin();
      expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
      expect(onSignedIn).not.toHaveBeenCalled();
    },
  );

  it('shows provider and model when AI is configured, without «Set up AI»', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          provider: 'google',
          providerName: 'Google',
          model: 'gemini-3.8-flash',
          keySet: true,
          baseUrlHost: null,
          source: 'env',
          keyLast4: null,
          keyUnreadable: false,
          savedInactive: false,
          rev: null,
          refineLimit: null,
          state: 'ok',
          checkedAt: null,
        }),
      ),
    );
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    render(
      <I18nProvider>
        <SetupScreen config={config} onSignedIn={async () => {}} step={3} />
      </I18nProvider>,
    );
    expect(await screen.findByText('Google · gemini-3.8-flash')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'AI connected' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Set up AI' })).toBeNull();
  });

  it('a failing provider asks to check the key and model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          provider: 'google',
          providerName: 'Google',
          model: 'gemini-3.8-flash',
          keySet: true,
          baseUrlHost: null,
          source: 'env',
          keyLast4: null,
          keyUnreadable: false,
          savedInactive: false,
          rev: null,
          refineLimit: null,
          state: 'unavailable',
          checkedAt: null,
        }),
      ),
    );
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    render(
      <I18nProvider>
        <SetupScreen config={config} onSignedIn={async () => {}} step={3} />
      </I18nProvider>,
    );
    expect(
      await screen.findByText('Check the key and model in AI settings'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Set up AI' })).toBeTruthy();
  });

  it('both methods at another origin: password first and the reason', async () => {
    renderSetup({ origin: 'http://192.168.1.5:3000' });
    serve();
    await enter('K7QM-3XRP');
    expect(await screen.findByText('Passkeys won’t work here')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy();
  });
});
