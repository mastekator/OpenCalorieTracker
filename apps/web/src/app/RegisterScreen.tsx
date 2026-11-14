import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { CircleAlert, Link2Off, UserRound } from 'lucide-react';
import { Link } from 'wouter';
import { z } from 'zod';
import {
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/browser';
import {
  emailSchema,
  inviteCheckResponseSchema,
  meResponseSchema,
  passwordProblems,
  PASSWORD_MAX_LENGTH,
  type AuthMethod,
  type ConfigResponse,
  type InviteCheckResponse,
  type LinkStatus,
  type MeResponse,
} from '@oct/shared';
import { api, ApiError } from '../api/client';
import { useT } from '../i18n';
import type { Key } from '../i18n/translate';
import { Banner } from '../ui/Banner/Banner';
import { Button } from '../ui/Button/Button';
import { Field } from '../ui/Field/Field';
import { NavBar } from '../ui/NavBar/NavBar';
import { PasswordRules } from '../ui/PasswordRules/PasswordRules';
import { ScreenState } from '../ui/ScreenState/ScreenState';
import { Segment } from '../ui/Segment/Segment';
import { isInAppBrowser, LINK_ERRORS, linkProblem } from './link';
import { isCancel } from './LoginScreen';
import './LoginScreen.css';
import './RegisterScreen.css';

/** invite: 2.1–2.3, recovery: 2.6, open: 2.7 (REGISTRATION=open, no link). */
export type RegisterKind = 'invite' | 'recovery' | 'open';

type Props = {
  kind: RegisterKind;
  config: ConfigResponse;
  /** The link's secret from the URL fragment; none for open registration. */
  token?: string;
  /** Who is signed in on this device: a link then shows 2.5 and is not used. */
  user: MeResponse | null;
  /** Called after the server set the session cookie. */
  onSignedIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  /** Props only for stories and tests. */
  userAgent?: string;
  href?: string;
};

/** Accepting an invite, recovering access, or creating an account (OCT-13 §6). */
export function RegisterScreen(props: Props) {
  if (props.kind === 'open') return <RegisterForm {...props} email={null} />;
  if (props.user)
    return (
      <SignedIn
        kind={props.kind}
        user={props.user}
        onSignOut={props.onSignOut}
      />
    );
  return <LinkGate {...props} kind={props.kind} />;
}

function Brand({ children }: { children?: ReactNode }) {
  const { t } = useT();
  return (
    <header className="login__header">
      <img className="login__mark" src="/icon.svg" alt="" />
      <p className="login__app">{t('common.appName')}</p>
      {children}
    </header>
  );
}

/** Checks the token, then shows the form or why the link can't be used (2.4). */
function LinkGate(props: Props & { kind: 'invite' | 'recovery' }) {
  const { kind, token = '' } = props;
  const { t } = useT();
  const [check, setCheck] = useState<InviteCheckResponse | ApiError>();

  const load = useCallback(() => {
    setCheck(undefined);
    if (!token) return setCheck({ kind: null, email: null, status: 'invalid' });
    api('/api/auth/invites/check', inviteCheckResponseSchema, {
      method: 'POST',
      body: { token },
    }).then(setCheck, (err) =>
      setCheck(err instanceof ApiError ? err : new ApiError(0, 'internal')),
    );
  }, [token]);
  useEffect(load, [load]);

  if (!check) return <div className="login" aria-busy="true" />;
  if (check instanceof ApiError)
    return (
      <div className="login">
        <Brand />
        <ScreenState
          icon={<CircleAlert />}
          tone="danger"
          title={t(`errors.${check.code}`)}
          action={
            <Button variant="tonal" onClick={load}>
              {t('common.retry')}
            </Button>
          }
        />
      </div>
    );

  const problem = linkProblem(kind, check);
  if (problem)
    return (
      <div className="login">
        <Brand />
        <div className="register__state">
          <ScreenState
            icon={<Link2Off />}
            tone="warning"
            title={t(problem.title)}
          >
            {t(problem.body)}
          </ScreenState>
        </div>
        <Link className="button button--tonal" href="/login">
          {t('link.have_account')}
        </Link>
      </div>
    );

  return (
    <RegisterForm
      {...props}
      email={check.email}
      onLinkGone={(status) => setCheck({ ...check, status })}
    />
  );
}

/** 2.5: a signed-in user opened a link; signing out keeps the link unused (E-3.1, E-6.3). */
function SignedIn({
  kind,
  user,
  onSignOut,
}: {
  kind: 'invite' | 'recovery';
  user: MeResponse;
  onSignOut: () => Promise<void>;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const name = user.name ?? user.email;
  return (
    <div className="login">
      <Brand />
      <div className="register__state">
        <ScreenState
          icon={<UserRound />}
          title={t('signed_in.title', { name })}
        >
          {t(kind === 'invite' ? 'signed_in.body' : 'signed_in.body_recovery')}
        </ScreenState>
      </div>
      <div className="register__actions">
        <Button
          loading={busy}
          onClick={() => {
            setBusy(true);
            void onSignOut().finally(() => setBusy(false));
          }}
        >
          {t('signed_in.logout')}
        </Button>
        <Link className="button button--plain" href="/">
          {t('signed_in.stay', { name })}
        </Link>
      </div>
    </div>
  );
}

const optionsSchema = z.object({
  challengeId: z.string(),
  options: z.custom<PublicKeyCredentialCreationOptionsJSON>(
    (v) => typeof v === 'object' && v !== null,
  ),
});

type FieldName = 'email' | 'name' | 'password' | 'repeat';

/** The form of 2.1/2.2/2.6/2.7; what was typed survives any server error (E-3.5). */
function RegisterForm({
  kind,
  config,
  token,
  email: lockedEmail,
  onSignedIn,
  onLinkGone,
  userAgent = navigator.userAgent,
  href = location.href,
}: Props & {
  /** Fixed by the link; null for open registration, where it is typed. */
  email: string | null;
  onLinkGone?: (status: LinkStatus) => void;
}) {
  const { t, locale } = useT();
  const inApp = kind !== 'open' && isInAppBrowser(userAgent);
  const methods = config.authMethods;
  const [method, setMethod] = useState<AuthMethod>(
    methods.includes('passkey') && !(inApp && methods.includes('password'))
      ? 'passkey'
      : 'password',
  );
  const [email, setEmail] = useState(lockedEmail ?? '');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState<FieldName[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [common, setCommon] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState<'done' | 'failed' | null>(null);

  const withPassword = method === 'password';
  const errors: Record<FieldName, Key | undefined> = {
    email:
      kind === 'open' && !emailSchema.safeParse(email).success
        ? 'form.err.email'
        : undefined,
    name:
      kind !== 'recovery' && !name.trim()
        ? 'form.err.required_name'
        : undefined,
    password: !withPassword
      ? undefined
      : [...password].length > PASSWORD_MAX_LENGTH
        ? 'pw.err.too_long'
        : common
          ? 'pw.err.common'
          : undefined,
    repeat: withPassword && repeat !== password ? 'pw.err.mismatch' : undefined,
  };
  // Errors appear on leaving a field or on submit, not on every keystroke (2.2).
  const shown = (f: FieldName) => {
    const key = attempted || touched.includes(f) ? errors[f] : undefined;
    return key && t(key);
  };
  const blur = (f: FieldName) => () =>
    setTouched((all) => (all.includes(f) ? all : [...all, f]));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (
      Object.values(errors).some(Boolean) ||
      (withPassword && passwordProblems(password, email).length)
    )
      return;
    setBusy(true);
    setError(null);
    const path = kind === 'recovery' ? 'recover' : 'register';
    const body =
      kind === 'recovery'
        ? { token }
        : {
            token,
            email: kind === 'open' ? email : undefined,
            name: name.trim(),
            locale,
          };
    try {
      if (withPassword) {
        await api(`/api/auth/${path}`, meResponseSchema, {
          method: 'POST',
          body: { ...body, password },
        });
      } else {
        const { challengeId, options } = await api(
          `/api/auth/${path}/passkey/options`,
          optionsSchema,
          { method: 'POST', body },
        );
        const response = await startRegistration({ optionsJSON: options });
        await api(`/api/auth/${path}/passkey/verify`, meResponseSchema, {
          method: 'POST',
          body: { challengeId, response },
        });
      }
      await onSignedIn();
    } catch (err) {
      // Closing the system dialog is not an error (E-3.2).
      if (isCancel(err)) return;
      const code = err instanceof ApiError ? err.code : 'internal';
      if (code in LINK_ERRORS && onLinkGone)
        return onLinkGone(LINK_ERRORS[code as keyof typeof LINK_ERRORS]);
      if (code === 'password_too_common') setCommon(true);
      else
        setError(
          code === 'registration_failed' && kind === 'open'
            ? 'reg.open.failed' // Neutral: doesn't tell whether the email is taken (AC-3.6).
            : `errors.${code}`,
        );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(href);
      setCopy('done');
    } catch {
      // Webviews often lack the clipboard API: show the link to copy by hand.
      setCopy('failed');
    }
  }

  const both = methods.includes('passkey') && methods.includes('password');
  const methodLabel = (m: AuthMethod) =>
    t(kind === 'recovery' ? `recovery.method.${m}` : `reg.method.${m}`);
  const hint =
    method === 'passkey'
      ? t(kind === 'recovery' ? 'recovery.hint' : 'reg.passkey_hint')
      : undefined;
  // 2.3 with password sign-in off: passkeys can't work here, only the way out is offered.
  const showForm = !(inApp && !methods.includes('password'));

  return (
    <div className="login">
      {kind === 'open' ? (
        <NavBar
          large
          title={t('reg.open.title')}
          back={{ href: '/login', label: t('screens.login') }}
        />
      ) : (
        <Brand>
          <h1 className="register__title">
            {t(kind === 'invite' ? 'invite.title' : 'recovery.title')}
          </h1>
          <p className="register__lead">
            {kind === 'invite'
              ? t('invite.lead')
              : t('recovery.lead', { email: lockedEmail ?? '' })}
          </p>
        </Brand>
      )}

      {inApp && (
        <>
          <Banner tone="warning" title={t('reg.inapp.title')}>
            {t('reg.inapp.body')}
          </Banner>
          <Button variant="tonal" onClick={() => void copyLink()}>
            {t(copy === 'done' ? 'link_ready.copied' : 'reg.inapp.copy')}
          </Button>
          {copy === 'failed' && <p className="register__link">{href}</p>}
        </>
      )}

      {showForm && (
        <form className="register__form" onSubmit={submit} noValidate>
          {kind !== 'recovery' && (
            <Field
              label={t('auth.email')}
              type="email"
              autoComplete="username"
              locked={kind === 'invite'}
              hint={t(
                kind === 'invite'
                  ? 'invite.email_locked_hint'
                  : 'reg.open.email_hint',
              )}
              placeholder={t('auth.email_ph')}
              value={email}
              error={shown('email')}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={blur('email')}
            />
          )}
          {kind !== 'recovery' && (
            <Field
              label={t('reg.name')}
              placeholder={t('reg.name_ph')}
              autoComplete="name"
              value={name}
              error={shown('name')}
              onChange={(e) => setName(e.target.value)}
              onBlur={blur('name')}
            />
          )}
          {(both || hint) && (
            <div className="field">
              {both && (
                <>
                  <span className="field__label" aria-hidden="true">
                    {t('reg.method.title')}
                  </span>
                  <Segment
                    label={t('reg.method.title')}
                    options={(['passkey', 'password'] as const).map((m) => ({
                      value: m,
                      label: methodLabel(m),
                    }))}
                    value={method}
                    onChange={setMethod}
                  />
                </>
              )}
              {hint && <p className="field__note">{hint}</p>}
            </div>
          )}
          {withPassword && (
            <>
              <div className="field">
                <Field
                  label={methodLabel('password')}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  error={shown('password')}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setCommon(false);
                  }}
                  onBlur={blur('password')}
                />
                <PasswordRules
                  password={password}
                  email={email || undefined}
                  attempted={attempted || touched.includes('password')}
                />
              </div>
              <Field
                label={t('reg.password_repeat')}
                type="password"
                autoComplete="new-password"
                value={repeat}
                error={shown('repeat')}
                onChange={(e) => setRepeat(e.target.value)}
                onBlur={blur('repeat')}
              />
            </>
          )}
          {error && <Banner tone="danger">{t(error)}</Banner>}
          <div className="register__submit">
            <Button type="submit" loading={busy}>
              {t(withPassword ? 'reg.create_account' : 'reg.create_passkey')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
