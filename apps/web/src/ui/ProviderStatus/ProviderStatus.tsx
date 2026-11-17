import { useState, type ReactNode } from 'react';
import { ChevronDown, ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import {
  AI_PROVIDERS,
  type AdminAiStatus,
  type AiProviderId,
  type AiProviderState,
} from '@oct/shared';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import { Banner } from '../Banner/Banner';
import { Button } from '../Button/Button';
import { List, ListRow } from '../List/List';
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

export const README_URL =
  'https://github.com/mastekator/OpenCalorieTracker/blob/main/docs/SELF_HOSTING.md#configuration';
const ENV_VARS = `AI_PROVIDER=google
AI_MODEL=gemini-3.8-flash
AI_API_KEY=…
# openai-compatible:
AI_BASE_URL=http://…`;

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
        ) : name ? (
          <p>{bold(t('ai.privacy.body', { provider: '\u0000' }), name)}</p>
        ) : (
          <p>
            {bold(
              t('ai.privacy.host', { host: '\u0000' }),
              status.baseUrlHost ?? '',
            )}
          </p>
        )}
        {configured && status.provider === 'google' && (
          <Banner tone="warning" title={t('ai.gemini.title')}>
            {t('ai.gemini.body')}
          </Banner>
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

/** What to set when no provider is configured. */
export function EnvBlock() {
  const { t } = useT();
  return (
    <section className="provider__env">
      <h2 className="list__title">{t('ai.off.how')}</h2>
      <p className="provider__muted">{t('ai.off.env')}</p>
      <pre className="provider__code">{ENV_VARS}</pre>
      <a
        className="provider__link"
        href={README_URL}
        target="_blank"
        rel="noreferrer"
      >
        {t('ai.off.readme')}
        <ExternalLink aria-hidden="true" />
      </a>
    </section>
  );
}

type Props = {
  status: AdminAiStatus;
  checking?: boolean;
  onCheck: () => void;
};

/** Screen «AI provider» (OCT-25 §5, D.2): state, model and key, check, privacy. */
export function ProviderStatus({ status, checking = false, onCheck }: Props) {
  const { t, locale } = useT();
  const { state } = status;
  const off = state === 'not_configured';
  const { tone, banner } = AI_STATES[state];
  const name = off
    ? t('ai.off.name')
    : (status.providerName ??
      (status.provider === 'openai-compatible'
        ? t('ai.compatible')
        : status.provider));
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
  const details = detailText && <Details>{detailText}</Details>;
  // A 404 from an own server is as often a wrong AI_BASE_URL path as a wrong model.
  const bannerBody =
    state === 'model_not_found' && status.provider === 'openai-compatible'
      ? 'ai.banner.model_not_found.body_compatible'
      : (`ai.banner.${state as Failure}.body` as const);

  return (
    <div className="provider">
      <div className="provider__main">
        <div className="provider__head">
          <span className={`provider__icon provider__icon--${tone}`}>
            <Sparkles aria-hidden="true" />
          </span>
          <span className="provider__name">
            <h2>{name}</h2>
            <StatusLine state={state} />
          </span>
        </div>
        {when && state !== 'unknown' && (
          <p className="provider__muted">
            {t(state === 'ok' ? 'ai.checked' : 'ai.last', { when })}
          </p>
        )}
        {off ? (
          <>
            <p>{t('ai.off.body')}</p>
            <EnvBlock />
          </>
        ) : (
          <>
            {banner && (
              <Banner
                tone={banner}
                title={t(`ai.banner.${state as Failure}.title`)}
              >
                {t(bannerBody, {
                  model: status.model ?? '',
                  count: status.details?.timeoutSec ?? '',
                })}
              </Banner>
            )}
            {details}
            <List>
              {status.baseUrlHost && (
                <ListRow
                  value={
                    <span className="provider__mono">{status.baseUrlHost}</span>
                  }
                >
                  {t('ai.address')}
                </ListRow>
              )}
              {status.model && (
                <ListRow
                  value={<span className="provider__mono">{status.model}</span>}
                >
                  {t('ai.model')}
                </ListRow>
              )}
              <ListRow value={t(status.keySet ? 'ai.key_set' : 'ai.key_unset')}>
                {t('ai.key')}
              </ListRow>
            </List>
            <div className="provider__check">
              <Button variant="tonal" loading={checking} onClick={onCheck}>
                {!checking && <RefreshCw aria-hidden="true" />}
                {t(checking ? 'ai.checking' : 'ai.check')}
              </Button>
              <p className="provider__muted">{t('ai.check_note')}</p>
            </div>
          </>
        )}
      </div>
      <div className="provider__side">
        <PrivacyCard status={status} />
      </div>
    </div>
  );
}
