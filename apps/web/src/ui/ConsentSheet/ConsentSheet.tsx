import { ExternalLink, Sparkles } from 'lucide-react';
import { AI_PROVIDERS, type AiConsentRequired } from '@oct/shared';
import { useT } from '../../i18n';
import { Banner } from '../Banner/Banner';
import { Button } from '../Button/Button';
import { Sheet } from '../Sheet/Sheet';
import '../BarcodeConsentSheet/BarcodeConsentSheet.css';
import './ConsentSheet.css';

/** What the action that asked sends: a photo, the goal chat, or recipe/dish text. */
export type ConsentWhat = 'photo' | 'agent' | 'text';

type Props = {
  open: boolean;
  /** From the 403 ai_consent_required, not the local copy: that one may be stale. */
  details: AiConsentRequired;
  what: ConsentWhat;
  /** Disables «Allow» while the consent is being saved. */
  busy?: boolean;
  onAllow: () => void;
  /** «Not now», Esc, swipe down, tap outside. */
  onClose: () => void;
};

/** OCT-178 §2: asked once per provider and route before the user's data first goes out. */
export function ConsentSheet({
  open,
  details,
  what,
  busy,
  onAllow,
  onClose,
}: Props) {
  const { t } = useT();
  const { name, privacyUrl } = AI_PROVIDERS[details.provider];
  const provider = name ?? details.host ?? details.providerKey;
  const rows = [
    ['who', provider, null],
    ['route', t('ai.consent.route_server'), location.host],
    ['what', t(`ai.consent.what_${what}`), t(`ai.consent.what_${what}_sub`)],
  ] as const;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('ai.consent.title', { provider })}
      icon={<Sparkles />}
      footer={
        <>
          <Button onClick={onAllow} disabled={busy}>
            {t('ai.consent.allow')}
          </Button>
          <Button variant="plain" onClick={onClose}>
            {t('ai.consent.not_now')}
          </Button>
        </>
      }
    >
      <div className="consent-sheet">
        <p>{t(what === 'photo' ? 'ai.consent.lead' : 'ai.consent.lead_ai')}</p>
        <dl className="consent-sheet__rows">
          {rows.map(([k, value, sub]) => (
            <div key={k} className="consent-sheet__row">
              <dt>{t(`ai.consent.${k}`)}</dt>
              <dd>
                {value}
                {sub && (
                  <span
                    className={`consent-sheet__sub${k === 'route' ? ' consent-sheet__sub--mono' : ''}`}
                  >
                    {sub}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {details.provider === 'google' && (
          <Banner tone="warning" title={t('ai.gemini.title')}>
            {t('ai.consent.gemini_body')}
          </Banner>
        )}
        <p className="consent-sheet__after">{t('ai.consent.after')}</p>
        {privacyUrl && (
          <a
            className="consent-sheet__link"
            href={privacyUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t('ai.privacy.policy', { provider })}
            <ExternalLink aria-hidden="true" />
          </a>
        )}
      </div>
    </Sheet>
  );
}
