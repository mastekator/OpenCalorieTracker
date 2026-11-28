import { useState, type ReactNode } from 'react';
import { ChevronDown, ExternalLink, Lock, Sparkles } from 'lucide-react';
import {
  AI_PROVIDERS,
  type AdminAiStatus,
  type AiProviderId,
  type AiProviderState,
} from '@oct/shared';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import { Banner } from '../Banner/Banner';
import { List } from '../List/List';
import './ProviderStatus.css';

type Tone = 'ok' | 'err' | 'warn' | 'off';
type Failure = Exclude<AiProviderState, 'ok' | 'not_configured' | 'unknown'>;

/** Dot shape and colour, settings badge and banner tone per state (OCT-25 §5, 5.5). */
export const AI_STATES: Record<
  AiProviderState,
  {
    tone: Tone;
    badge: 'ok' | 'err' | 'warn' | 'neutral';
    banner?: 'danger' | 'warning';
  }
> = {
  ok: { tone: 'ok', badge: 'ok' },
  not_configured: { tone: 'off', badge: 'neutral' },
  auth_error: { tone: 'err', badge: 'err', banner: 'danger' },
  quota_exceeded: { tone: 'warn', badge: 'warn', banner: 'warning' },
  unavailable: { tone: 'err', badge: 'err', banner: 'danger' },
  model_not_found: { tone: 'err', badge: 'err', banner: 'danger' },
  timeout: { tone: 'err', badge: 'err', banner: 'danger' },
  no_vision: { tone: 'warn', badge: 'warn', banner: 'warning' },
  unknown: { tone: 'off', badge: 'neutral' },
};

/** ChatGPT settings, where the subscription owner sees the app usage limit (OCT-178 3.2, 3.6). */
export const CHATGPT_USAGE_URL = 'https://chatgpt.com/#settings';

/** «App usage limit — in ChatGPT settings». */
export function ChatGptUsageLink() {
  const { t } = useT();
  return (
    <a
      className="provider__link"
      href={CHATGPT_USAGE_URL}
      target="_blank"
      rel="noreferrer"
    >
      {t('ai.chatgpt.usage')}
      <ExternalLink aria-hidden="true" />
    </a>
  );
}

export const README_URL =
  'https://github.com/mastekator/OpenCalorieTracker/blob/main/docs/SELF_HOSTING.md#configuration';

/** The state's badge for the settings row. */
export function AiStateBadge({ state }: { state: AiProviderState }) {
  const { t } = useT();
  return <Badge tone={AI_STATES[state].badge}>{t(`ai.badge.${state}`)}</Badge>;
}

/** Colour, dot shape and text: never colour alone; the dot is decoration. */
export function StatusLine({ state }: { state: AiProviderState }) {
  const { t } = useT();
  return (
    <span className={`status-line status-line--${AI_STATES[state].tone}`}>
      <i className="status-line__dot" aria-hidden="true" />
      {t(`ai.status.${state}`)}
    </span>
  );
}

/** «Details» disclosure with the provider's code and message in mono. */
export function Details({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="provider__details">
      <button
        type="button"
        className="provider__summary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown aria-hidden="true" />
        {t('ai.details')}
      </button>
      {open && <pre className="provider__code">{children}</pre>}
    </div>
  );
}

/** Bolds `value` inside a translated sentence. */
function bold(text: string, value: string) {
  const [before, after] = text.split('\u0000');
  return (
    <>
      {before}
      <b>{value}</b>
      {after}
    </>
  );
}

/** «Where your data goes» (AC-6.7–6.9). */
export function PrivacyCard({ status }: { status: AdminAiStatus }) {
  const { t } = useT();
  const configured = status.state !== 'not_configured';
  const name = status.providerName;
  const policy =
    AI_PROVIDERS[status.provider as AiProviderId]?.privacyUrl ?? null;
  return (
    <List title={t('ai.privacy.title')}>
      <li className="provider__card">
        {!configured ? (
          <p>{t('ai.privacy.none')}</p>
        ) : (
          <p>
            {name
              ? bold(t('ai.privacy.body', { provider: '\u0000' }), name)
              : bold(
                  t('ai.privacy.host', { host: '\u0000' }),
                  status.baseUrlHost ?? '',
                )}{' '}
            {/* Server AI asks each user before their data first goes out (OCT-178 §2). */}
            {t('ai.privacy.consent')}
          </p>
        )}
        {configured && name && policy && (
          <a
            className="provider__link"
            href={policy}
            target="_blank"
            rel="noreferrer"
          >
            {t('ai.privacy.policy', { provider: name })}
            <ExternalLink aria-hidden="true" />
          </a>
        )}
      </li>
    </List>
  );
}

type Props = {
  status: AdminAiStatus;
  /** The settings form and its buttons, under the state. */
  children?: ReactNode;
  /** Under «Where your data goes», e.g. «Turn off AI». */
  side?: ReactNode;
  /** «Model test»: after the form on a phone, above the side column on a desktop (OCT-248 6.1). */
  test?: ReactNode;
  /** «Model comparison»: last, across both columns on a desktop (OCT-248 6.2). */
  compare?: ReactNode;
};

/** Screen «AI provider» (OCT-25 §5, OCT-248): state, then the form; privacy on the side. */
export function ProviderStatus({
  status,
  children,
  side,
  test,
  compare,
}: Props) {
  const { t, locale } = useT();
  const { state } = status;
  const off = state === 'not_configured';
  const { tone, banner } = AI_STATES[state];
  const name =
    (status.provider === 'chatgpt' ? t('ai.chatgpt.provider') : null) ??
    status.providerName ??
    (status.provider === 'openai-compatible'
      ? t('ai.compatible')
      : (status.provider ?? t('ai.off.name')));
  const when =
    status.checkedAt !== null &&
    new Intl.DateTimeFormat(locale, {
      // The date only when it is not today.
      ...(new Date(status.checkedAt).toDateString() !==
        new Date().toDateString() && { dateStyle: 'medium' }),
      timeStyle: 'short',
    }).format(status.checkedAt);
  const detailText = [
    status.details?.status && `HTTP ${status.details.status}`,
    status.details?.message,
  ]
    .filter(Boolean)
    .join('\n');
  // Saved from this screen: no AI_* to fix and nothing to restart (OCT-248 §5).
  const admin = status.source === 'admin';
  // The subscription's own words: sign in again, or wait for its limit (OCT-178 3.5, 3.6).
  const sub =
    status.provider === 'chatgpt' &&
    (state === 'auth_error' || state === 'quota_exceeded')
      ? state
      : null;
  const bannerBody =
    admin && (state === 'auth_error' || state === 'model_not_found')
      ? (`ai.banner.${state}.body_admin` as const)
      : state === 'model_not_found' && status.provider === 'openai-compatible'
        ? 'ai.banner.model_not_found.body_compatible'
        : (`ai.banner.${state as Failure}.body` as const);

  return (
    <div className="provider">
      <div className="provider__main">
        {/* First on the screen: nothing below can be changed here (OCT-248 3.3). */}
        {status.source === 'env' && (
          <Banner tone="notice" icon={<Lock />} title={t('ai.form.env_title')}>
            {t('ai.form.env_body')}
          </Banner>
        )}
        <section className="provider__state" aria-label={t('ai.status_label')}>
          <div className="provider__head">
            <span className={`provider__icon provider__icon--${tone}`}>
              <Sparkles aria-hidden="true" />
            </span>
            <span className="provider__name">
              <h2>{name}</h2>
              {status.model && (
                <span className="provider__mono provider__muted">
                  {status.model}
                </span>
              )}
            </span>
          </div>
          <StatusLine state={state} />
          {off && <p className="provider__muted">{t('ai.off.body')}</p>}
          {when && state !== 'unknown' && (
            <p className="provider__muted">
              {t(state === 'ok' ? 'ai.checked' : 'ai.last', { when })}
            </p>
          )}
        </section>
        {sub ? (
          <Banner
            tone={banner}
            title={t(`ai.chatgpt.${sub}.title`)}
            actions={sub === 'quota_exceeded' && <ChatGptUsageLink />}
          >
            {t(
              status.details?.reason === 'plan_not_allowed'
                ? 'ai.chatgpt.auth_error.body_plan'
                : `ai.chatgpt.${sub}.body`,
            )}
          </Banner>
        ) : (
          banner && (
            <Banner
              tone={banner}
              title={t(`ai.banner.${state as Failure}.title`)}
            >
              {t(bannerBody, {
                model: status.model ?? '',
                count: status.details?.timeoutSec ?? '',
              })}
            </Banner>
          )
        )}
        {detailText && <Details>{detailText}</Details>}
        {children}
      </div>
      <div className="provider__side">
        {test}
        <PrivacyCard status={status} />
        {side}
      </div>
      {compare && <div className="provider__wide">{compare}</div>}
    </div>
  );
}
