import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Clock,
  KeyRound,
  Link2Off,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { Link } from 'wouter';
import { z } from 'zod';
import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  WebAuthnAbortService,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import {
  meResponseSchema,
  type ConfigResponse,
  type SetupError,
} from '@oct/shared';
import { api, ApiError, type ClientErrorCode } from '../api/client';
import { useT } from '../i18n';
import { Banner } from '../ui/Banner/Banner';
import { Button } from '../ui/Button/Button';
import { Field } from '../ui/Field/Field';
import { OfflineBar, useOnline } from '../ui/OfflineBar/OfflineBar';
import { ScreenState } from '../ui/ScreenState/ScreenState';
import { Sheet } from '../ui/Sheet/Sheet';
import './LoginScreen.css';

export type LoginLayout =
  | { kind: 'setup_error'; error: SetupError }
  | { kind: 'wrong_origin'; publicUrl: string }
  | { kind: 'form'; passkey: boolean; password: boolean; register: boolean };

/** What the sign-in screen shows for this installation, opened at `origin` (OCT-13 §5). */
export function loginLayout(
  config: ConfigResponse,
  origin: string,
): LoginLayout {
  // First: with a setup error publicUrl may be null.
  if (config.setupError)
    return { kind: 'setup_error', error: config.setupError };
  // WebAuthn and CSRF only accept PUBLIC_URL's origin (AC-7.2).
  if (config.publicUrl && new URL(config.publicUrl).origin !== origin)
    return { kind: 'wrong_origin', publicUrl: config.publicUrl };
  return {
    kind: 'form',
    passkey: config.authMethods.includes('passkey'),
    password: config.authMethods.includes('password'),
    register: config.registration === 'open',
  };
}

/** The banner: password ones (`password`, timeout, blocked) sit above the fields, the rest on top. */
export type Notice =
  | { kind: 'expired' }
  | { kind: 'error'; code: ClientErrorCode; password?: true }
  | { kind: 'timeout'; until: number }
  | { kind: 'blocked' }
  | { kind: 'no_passkey' }
  | { kind: 'revoked' };

function noticeOf(err: unknown, fallback: ClientErrorCode): Notice {
  if (!(err instanceof ApiError)) return { kind: 'error', code: fallback };
  switch (err.code) {
    case 'too_many_attempts': {
      const sec = (err.details as { retryAfterSec?: unknown } | undefined)
        ?.retryAfterSec;
      return {
        kind: 'timeout',
        until: Date.now() + (typeof sec === 'number' ? sec : 60) * 1000,
      };
    }
    case 'device_blocked':
    case 'ip_blocked':
      return { kind: 'blocked' };
    case 'passkey_unknown':
      return { kind: 'revoked' };
    default:
      return { kind: 'error', code: err.code };
  }
}

const optionsSchema = z.object({
  challengeId: z.string(),
  options: z.custom<PublicKeyCredentialRequestOptionsJSON>(
    (v) => typeof v === 'object' && v !== null,
  ),
});

/** The user closed the system dialog, or another ceremony replaced this one: no message (E-5.1). */
export const isCancel = (err: unknown) =>
  err instanceof Error &&
  (err.name === 'NotAllowedError' || err.name === 'AbortError');

type Props = {
  config: ConfigResponse;
  /** Called after the server set the session cookie. */
  onSignedIn: () => Promise<void>;
  /** Banner shown on arrival («session expired»). */
  notice?: Notice;
  /** The page's origin; a prop only for stories and tests. */
  origin?: string;
};

export function LoginScreen({
  config,
  onSignedIn,
  notice: initialNotice,
  origin = location.origin,
}: Props) {
  const { t } = useT();
  const layout = loginLayout(config, origin);
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'passkey' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(initialNotice ?? null);
  const [now, setNow] = useState(Date.now);
  const [sheet, setSheet] = useState<'forgot' | 'lost' | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const form = layout.kind === 'form' ? layout : null;
  const withForm = !!form?.password;

  // The timeout banner counts down once a minute and goes away when the timeout ends.
  const timeoutLeft = notice?.kind === 'timeout' ? notice.until - now : 0;
  useEffect(() => {
    if (timeoutLeft <= 0) return;
    const id = setTimeout(
      () => setNow(Date.now()),
      timeoutLeft % 60_000 || 60_000,
    );
    return () => clearTimeout(id);
  }, [timeoutLeft]);
  const shown = notice?.kind === 'timeout' && timeoutLeft <= 0 ? null : notice;
  const timedOut = shown?.kind === 'timeout';
  const blocked = shown?.kind === 'blocked';

  const show = (next: Notice) => {
    setNow(Date.now());
    setNotice(next);
  };

  async function passkey(autofill: boolean, alive = () => true) {
    if (!autofill) {
      if (!browserSupportsWebAuthn()) return show({ kind: 'no_passkey' });
      setBusy('passkey');
    }
    let picked = !autofill;
    try {
      const { challengeId, options } = await api(
        '/api/auth/passkey/login/options',
        optionsSchema,
        { method: 'POST' },
      );
      if (!alive()) return;
      // A new ceremony aborts the previous one: the button cancels the autofill request.
      const response = await startAuthentication({
        optionsJSON: options,
        useBrowserAutofill: autofill,
      });
      picked = true;
      setBusy('passkey');
      await api('/api/auth/passkey/login/verify', meResponseSchema, {
        method: 'POST',
        body: { challengeId, response },
      });
      await onSignedIn();
    } catch (err) {
      // Autofill runs in the background: only what follows the user's choice is reported.
      if (!picked || isCancel(err)) return;
      show(noticeOf(err, 'passkey_failed'));
    } finally {
      if (picked) setBusy(null);
    }
  }

  // Conditional UI: passkeys offered in the email field's autofill (iOS: above the keyboard).
  useEffect(() => {
    if (!form?.passkey || !form.password) return;
    let alive = true;
    void browserSupportsWebAuthnAutofill().then((ok) => {
      if (ok && alive) void passkey(true, () => alive);
    });
    return () => {
      alive = false;
      WebAuthnAbortService.cancelCeremony();
    };
    // Once per screen: `passkey` is a new function every render.
  }, [form?.passkey, form?.password]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!online || timedOut) return;
    setBusy('password');
    setNotice(null);
    try {
      await api('/api/auth/login', meResponseSchema, {
        method: 'POST',
        body: { email, password },
      });
      await onSignedIn();
    } catch (err) {
      const next = noticeOf(err, 'internal');
      show(next.kind === 'error' ? { ...next, password: true } : next);
      if (next.kind === 'error' && next.code === 'invalid_credentials') {
        setPassword('');
        passwordRef.current?.focus();
      }
    } finally {
      setBusy(null);
    }
  }

  const brand = (
    <>
      <img className="login__mark" src="/icon.svg" alt="" />
      <p className="login__app">{t('common.appName')}</p>
    </>
  );

  if (layout.kind === 'setup_error')
    return (
      <div className="login">
        <header className="login__header">{brand}</header>
        <ScreenState
          icon={<TriangleAlert />}
          tone="danger"
          title={t('setup.not_configured.title')}
        >
          {t(
            layout.error === 'public_url_invalid'
              ? 'setup.not_configured.url'
              : 'setup.not_configured.admin',
          )}
        </ScreenState>
      </div>
    );

  if (layout.kind === 'wrong_origin')
    return (
      <div className="login">
        <header className="login__header">{brand}</header>
        <ScreenState
          icon={<Link2Off />}
          tone="warning"
          title={t('setup.wrong_origin.title')}
          action={
            <a className="button button--primary" href={layout.publicUrl}>
              {t('setup.wrong_origin.cta', {
                host: new URL(layout.publicUrl).host,
              })}
            </a>
          }
        >
          {t('setup.wrong_origin.body')}
        </ScreenState>
      </div>
    );

  const { passkey: withPasskey, register } = layout;
  const showForm = withForm && !blocked;
  const atFields =
    withForm &&
    (timedOut || blocked || (shown?.kind === 'error' && !!shown.password));
  const banner = online && shown && (
    <NoticeBanner
      notice={shown}
      minutes={Math.ceil(timeoutLeft / 60_000)}
      withPassword={withForm}
      withPasskey={withPasskey}
    />
  );

  return (
    <div className="login">
      <OfflineBar />
      <header className="login__header">
        {brand}
        <h1 className="login__title">{t('screens.login')}</h1>
      </header>

      {!atFields && banner}

      <div className={`login__body${withForm ? '' : ' login__body--end'}`}>
        {withPasskey && (
          <Button
            variant="primary"
            loading={busy === 'passkey'}
            disabled={!online || busy === 'password'}
            onClick={() => void passkey(false)}
          >
            <KeyRound aria-hidden="true" />
            {t('auth.passkey')}
          </Button>
        )}
        {withPasskey && withForm && (
          <p className="login__divider">{t('auth.or_password')}</p>
        )}
        {atFields && banner}
        {showForm && (
          <form className="login__form" onSubmit={signIn}>
            <Field
              label={t('auth.email')}
              placeholder={t('auth.email_ph')}
              type="email"
              autoComplete="username webauthn"
              required
              locked={timedOut}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Field
              ref={passwordRef}
              label={t('auth.password')}
              type="password"
              autoComplete="current-password"
              required
              locked={timedOut}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              variant={withPasskey ? 'tonal' : 'primary'}
              loading={busy === 'password'}
              disabled={!online || timedOut || busy === 'passkey'}
            >
              {busy === 'password' ? t('auth.loading') : t('auth.submit')}
            </Button>
          </form>
        )}
        {!online && <p className="login__divider">{t('auth.offline')}</p>}
        {showForm ? (
          <Button variant="plain" onClick={() => setSheet('forgot')}>
            {t('auth.forgot')}
          </Button>
        ) : (
          <Button variant="plain" onClick={() => setSheet('lost')}>
            {t('auth.lost_access')}
          </Button>
        )}
      </div>
      {register && (
        <p className="login__register">
          {t('auth.no_account')}
          <Link href="/register">{t('auth.create')}</Link>
        </p>
      )}

      <Sheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={t(
          sheet === 'lost' ? 'auth.lost_access' : 'auth.forgot_sheet.title',
        )}
        footer={
          <Button variant="tonal" onClick={() => setSheet(null)}>
            {t('common.got_it')}
          </Button>
        }
      >
        <p>{t('auth.forgot_sheet.body')}</p>
      </Sheet>
    </div>
  );
}

function NoticeBanner({
  notice,
  minutes,
  withPassword,
  withPasskey,
}: {
  notice: Notice;
  minutes: number;
  withPassword: boolean;
  withPasskey: boolean;
}) {
  // «Passkey still works» only when there is a passkey button (mockup 1.4).
  const body = withPasskey ? 'body' : 'body_password_only';
  const { t } = useT();
  switch (notice.kind) {
    case 'expired':
      return <Banner tone="notice">{t('auth.session_expired')}</Banner>;
    case 'error':
      return <Banner tone="danger">{t(`errors.${notice.code}`)}</Banner>;
    case 'timeout':
      return (
        <Banner
          tone="warning"
          icon={<Clock aria-hidden="true" />}
          title={t('auth.err.timeout.title')}
        >
          {t(`auth.err.timeout.${body}`, { n: minutes })}
        </Banner>
      );
    case 'blocked':
      return (
        <Banner
          tone="danger"
          icon={<ShieldAlert aria-hidden="true" />}
          title={t('auth.err.blocked.title')}
        >
          {t(`auth.err.blocked.${body}`)}
        </Banner>
      );
    case 'no_passkey':
      return (
        <Banner tone="notice" title={t('auth.err.no_passkey.title')}>
          {t(
            withPassword
              ? 'auth.err.no_passkey.body_password'
              : 'auth.err.no_passkey.body_passkey_only',
          )}
        </Banner>
      );
    case 'revoked':
      return <Banner tone="notice">{t('auth.err.passkey_revoked')}</Banner>;
  }
}
