import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Link2Off,
  Shield,
  ShieldAlert,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { Link } from 'wouter';
import { z } from 'zod';
import {
  adminAiStatusSchema,
  type AdminAiStatus,
  type ConfigResponse,
} from '@oct/shared';
import { api } from '../api/client';
import { INVITES_PATH } from '../features/admin/InvitesScreen';
import { AI_STATUS_PATH } from '../features/settings/aiDraft';
import { useT } from '../i18n';
import { Banner } from '../ui/Banner/Banner';
import { Button } from '../ui/Button/Button';
import { CommandLine } from '../ui/CommandLine/CommandLine';
import { Field } from '../ui/Field/Field';
import { LocaleToggle } from '../ui/LocaleToggle/LocaleToggle';
import { Mark } from '../ui/Mark/Mark';
import { OfflineBar, useOnline } from '../ui/OfflineBar/OfflineBar';
import { AI_STATES, StatusLine } from '../ui/ProviderStatus/ProviderStatus';
import { ScreenState } from '../ui/ScreenState/ScreenState';
import { loginLayout } from './LoginScreen';
import { noticeOf, useNotice, type Notice } from './notice';
import { RegisterForm, type PasskeyNotice } from './RegisterScreen';
import './SetupScreen.css';

/** The compose service name from our docker-compose.yml. */
const SERVICE = 'opencalorietracker';
export const SETUP_DOCS_URL =
  'https://github.com/mastekator/OpenCalorieTracker/blob/main/docs/SELF_HOSTING.md';
const LOGS = `docker compose logs ${SERVICE} | grep "Setup code"`;
const RESTART = `docker compose restart ${SERVICE}`;
const RESET = `docker compose exec ${SERVICE} node dist/cli.js reset-admin-access`;

/** States that replace the form: the code can't be used any more (OCT-244 1.7–1.9). */
type End = 'expired' | 'burned' | 'done';
const ENDS: Partial<Record<string, End>> = {
  setup_code_expired: 'expired',
  setup_code_burned: 'burned',
  setup_done: 'done',
};

/** Upper case, no separators, a hyphen after the 4th character: `K7QM-3XRP`. */
export const formatCode = (value: string) => {
  const s = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
};

type Step = 1 | 2 | 3;

type Props = {
  config: ConfigResponse;
  /** Called after the server created the admin and set the session cookie. */
  onSignedIn: () => Promise<void>;
  /** The page's origin; a prop only for stories and tests. */
  origin?: string;
  /** Stories: «Where's the log?» opened, a notice, an end state or a later step shown on arrival. */
  helpOpen?: boolean;
  notice?: Notice;
  end?: End;
  step?: Step;
  passkeyNotice?: PasskeyNotice;
};

/**
 * The first-run wizard (OCT-242, mockups OCT-244): step 1 checks the setup code; the code lives
 * only in this component's state, never in storage or the URL (ADR-0021 §4).
 */
export function SetupScreen({
  config,
  onSignedIn,
  origin = location.origin,
  helpOpen = false,
  notice: initialNotice,
  end: initialEnd,
  step: initialStep = 1,
  passkeyNotice,
}: Props) {
  const { t } = useT();
  const online = useOnline();
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>(initialStep);
  const [end, setEnd] = useState<End | null>(initialEnd ?? null);
  const [fieldError, setFieldError] = useState<'short' | 'invalid' | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const { notice, minutes, show } = useNotice(initialNotice ?? null);
  const inputRef = useRef<HTMLInputElement>(null);

  const timedOut = notice?.kind === 'timeout';
  const blocked = notice?.kind === 'blocked';
  // Passkey only works at PUBLIC_URL: say so before the code is spent (AC-2.7, 1.10).
  const wrongOrigin =
    loginLayout(config, origin).kind === 'wrong_origin' &&
    !config.authMethods.includes('password');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!online || timedOut || busy) return;
    // A short code is a typo, not an attempt: no request (1.4).
    if (code.replace('-', '').length < 8) {
      setFieldError('short');
      return;
    }
    setBusy(true);
    setFieldError(null);
    show(null);
    try {
      await api('/api/setup/code', z.unknown(), {
        method: 'POST',
        body: { code },
      });
      setStep(2);
    } catch (err) {
      if (!codeFailed(err)) show(noticeOf(err, 'internal'));
    } finally {
      setBusy(false);
    }
  }

  /** Errors of the code at step 1 or 2 (AC-2.2): its end state, or back to step 1 to say why. */
  function codeFailed(err: unknown) {
    const next = noticeOf(err, 'internal');
    const ended = next.kind === 'error' ? ENDS[next.code] : undefined;
    if (ended) setEnd(ended);
    else if (next.kind === 'error' && next.code === 'setup_code_invalid') {
      // A restart replaced the code while step 2 was open: it is wrong now.
      setStep(1);
      setFieldError('invalid');
      // The whole code selected: easier to fix a typo (1.4).
      requestAnimationFrame(() => inputRef.current?.select());
    } else if (next.kind === 'timeout' || next.kind === 'blocked') {
      setStep(1);
      show(next);
    } else return false;
    return true;
  }

  const restart = () => {
    setEnd(null);
    setCode('');
    show(null);
  };

  const header = (current: number | null) => (
    <header className="setup__header">
      <div className="setup__brand">
        <Mark className="setup__mark" />
        <span>{t('common.appName')}</span>
        <LocaleToggle />
      </div>
      {current && (
        <div
          className="setup__steps"
          role="img"
          aria-label={t('setup.wizard.steps', { n: current })}
        >
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`setup__step${n <= current ? ' setup__step--done' : ''}`}
            />
          ))}
        </div>
      )}
    </header>
  );

  if (wrongOrigin && config.publicUrl)
    return (
      <div className="setup">
        {header(null)}
        <ScreenState
          icon={<Link2Off />}
          tone="warning"
          title={t('setup.wrong_origin.title')}
          action={
            <a className="button button--primary" href={config.publicUrl}>
              {t('setup.wrong_origin.cta', {
                host: new URL(config.publicUrl).host,
              })}
            </a>
          }
        >
          {t('setup.wrong_origin.body')}
        </ScreenState>
      </div>
    );

  if (end)
    return (
      <div className="setup">
        {header(null)}
        <ScreenState
          icon={
            end === 'expired' ? (
              <Clock />
            ) : end === 'burned' ? (
              <ShieldAlert />
            ) : (
              <Check />
            )
          }
          tone={
            end === 'expired'
              ? 'warning'
              : end === 'burned'
                ? 'danger'
                : 'neutral'
          }
          role="alert"
          focusTitle
          title={t(`setup.wizard.${end}.title`)}
          details={end !== 'done' && <CommandLine command={RESTART} />}
          action={
            end === 'done' ? (
              <Link className="button button--primary" href="/login">
                {t('setup.wizard.done.cta')}
              </Link>
            ) : (
              <Button onClick={restart}>{t('setup.wizard.new_code')}</Button>
            )
          }
        >
          {t(`setup.wizard.${end}.body`)}
        </ScreenState>
      </div>
    );

  if (step === 3)
    return (
      <div className="setup">
        {header(3)}
        <Ready />
      </div>
    );

  if (step === 2)
    // No way back to step 1: the code is taken; a closed tab enters it again (E-3.3).
    return (
      <div className="setup">
        {header(2)}
        <h1 className="setup__title">{t('setup.wizard.admin.title')}</h1>
        <p className="setup__lead">{t('setup.wizard.admin.lead')}</p>
        <RegisterForm
          kind="setup"
          config={config}
          email={null}
          code={code}
          origin={origin}
          passkeyNotice={passkeyNotice}
          onSetupError={codeFailed}
          onSignedIn={async () => {
            // Before the session refresh: the route then keeps the wizard on step 3.
            setStep(3);
            await onSignedIn();
          }}
        />
      </div>
    );

  return (
    <div className="setup">
      <OfflineBar variant={online ? null : 'no_network'} />
      {header(1)}
      <h1 className="setup__title">{t('setup.wizard.welcome')}</h1>
      <p className="setup__lead">{t('setup.wizard.lead')}</p>

      {online && timedOut && (
        <Banner
          tone="warning"
          icon={<Clock aria-hidden="true" />}
          title={t('setup.wizard.timeout.title')}
        >
          {t('setup.wizard.timeout.body', { n: minutes })}
        </Banner>
      )}
      {online && notice?.kind === 'error' && (
        <Banner tone="danger">{t(`errors.${notice.code}`)}</Banner>
      )}

      <form className="setup__form" onSubmit={submit} noValidate>
        {blocked ? (
          <Banner
            tone="danger"
            icon={<ShieldAlert aria-hidden="true" />}
            title={t('setup.wizard.blocked.title')}
            actions={<CommandLine command={RESET} />}
          >
            {t('setup.wizard.blocked.body')}
          </Banner>
        ) : (
          <>
            <div className="setup__code">
              <Field
                ref={inputRef}
                label={t('setup.wizard.code')}
                placeholder="XXXX-XXXX"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                // Focus on desktop only: on a phone the keyboard would hide the note below (1.1).
                autoFocus={window.matchMedia?.('(pointer: fine)').matches}
                disabled={busy || timedOut}
                error={fieldError ? t(`setup.wizard.${fieldError}`) : undefined}
                value={code}
                onChange={(e) => {
                  setCode(formatCode(e.target.value));
                  setFieldError(null);
                }}
              />
            </div>
            <details className="setup__help" open={helpOpen || undefined}>
              <summary>
                {t('setup.wizard.where')}
                <ChevronDown className="setup__chevron" aria-hidden="true" />
              </summary>
              <div className="setup__help-body">
                <section>
                  <h2>{t('setup.wizard.compose')}</h2>
                  <p>{t('setup.wizard.compose_hint')}</p>
                  <CommandLine command={LOGS} />
                </section>
                <section>
                  <h2>{t('setup.wizard.panel')}</h2>
                  <p>{t('setup.wizard.panel_hint')}</p>
                </section>
                <section>
                  <p>{t('setup.wizard.log_line')}</p>
                  <p className="setup__log" translate="no">
                    Setup code: <mark>K7QM-3XRP</mark> (valid until 2026-11-19
                    14:05 UTC)
                  </p>
                  <a href={SETUP_DOCS_URL} target="_blank" rel="noreferrer">
                    {t('setup.wizard.docs')}
                    <ExternalLink aria-hidden="true" />
                  </a>
                </section>
              </div>
            </details>
          </>
        )}

        <p className="setup__stranger">
          <Shield aria-hidden="true" />
          {t('setup.wizard.stranger')}
        </p>

        {blocked ? (
          <Button onClick={() => location.reload()}>
            {t('setup.wizard.new_code')}
          </Button>
        ) : (
          <Button type="submit" loading={busy} disabled={!online || timedOut}>
            {busy ? t('setup.wizard.checking') : t('setup.wizard.continue')}
          </Button>
        )}
      </form>
    </div>
  );
}

/** Step 3 «All set» (OCT-244 3.1–3.2): the admin is signed in; AI and invites can wait. */
function Ready() {
  const { t } = useT();
  // undefined while loading, null when the status didn't come: offer the setup either way.
  const [ai, setAi] = useState<AdminAiStatus | null>();
  useEffect(() => {
    api(AI_STATUS_PATH, adminAiStatusSchema).then(setAi, () => setAi(null));
  }, []);
  const on = ai && ai.state !== 'not_configured';
  const tone = ai ? AI_STATES[ai.state].tone : 'off';
  const name = ai && (ai.providerName ?? ai.provider ?? ai.baseUrlHost);

  return (
    <>
      <span className="setup__done">
        <Check aria-hidden="true" />
      </span>
      <h1 className="setup__title">{t('setup.wizard.ready.title')}</h1>
      <p className="setup__lead">{t('setup.wizard.ready.lead')}</p>
      <ul className="setup__next" aria-busy={ai === undefined || undefined}>
        <li>
          <span className={`provider__icon provider__icon--${tone}`}>
            <Sparkles aria-hidden="true" />
          </span>
          <div>
            <h2>
              {t(on ? 'setup.wizard.ready.ai_on' : 'setup.wizard.ready.ai_off')}
            </h2>
            {ai && <StatusLine state={ai.state} />}
            {on && name && (
              <p className="setup__mono" translate="no">
                {[name, ai.model].filter(Boolean).join(' · ')}
              </p>
            )}
            <p>
              {t(
                on
                  ? 'setup.wizard.ready.ai_on_body'
                  : 'setup.wizard.ready.ai_off_body',
              )}
            </p>
            {/* Configured and working needs nothing; off, failing or unknown — the AI screen. */}
            {ai !== undefined && tone !== 'ok' && (
              <Link
                className="button button--tonal button--small"
                href="/settings/admin/ai"
              >
                {t('setup.wizard.ready.ai_cta')}
              </Link>
            )}
          </div>
        </li>
        <li>
          <span className="provider__icon">
            <UserPlus aria-hidden="true" />
          </span>
          <div>
            <h2>{t('setup.wizard.ready.invite')}</h2>
            <p>{t('setup.wizard.ready.invite_body')}</p>
            <Link
              className="button button--tonal button--small"
              href={`${INVITES_PATH}?new`}
            >
              {t('setup.wizard.ready.invite_cta')}
            </Link>
          </div>
        </li>
      </ul>
      <Link className="button button--primary setup__go" href="/">
        {t('setup.wizard.ready.go')}
      </Link>
    </>
  );
}
