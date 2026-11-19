import { Lock } from 'lucide-react';
import { useT } from '../../i18n';
import '../ProviderStatus/ProviderStatus.css';
import './IntegrationStatus.css';

export type IntegrationState = 'off' | 'on' | 'blocked';

/** Text and shape, never colour alone (OCT-187 §1): ring — off, dot — on, lock — the admin's ban. */
export function IntegrationStatus({ state }: { state: IntegrationState }) {
  const { t } = useT();
  return (
    <span
      className={`status-line status-line--${state === 'on' ? 'ok' : 'off'}`}
    >
      {state === 'blocked' ? (
        <Lock className="integration-status__lock" aria-hidden="true" />
      ) : (
        <i className="status-line__dot" aria-hidden="true" />
      )}
      {t(`integr.status.${state}`)}
    </span>
  );
}
