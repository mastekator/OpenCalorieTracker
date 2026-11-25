import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useT } from '../../i18n';
import '../ProviderStatus/ProviderStatus.css';
import './IntegrationStatus.css';

export type IntegrationState = 'off' | 'on' | 'error' | 'blocked';

/** Text and shape, never colour alone (OCT-187 §1): ring — off, dot — on, diamond — error, lock — the admin's ban. */
export function IntegrationStatus({
  state,
  children,
}: {
  state: IntegrationState;
  /** A plain note on the same line, after the state ("· read-only"). */
  children?: ReactNode;
}) {
  const { t } = useT();
  return (
    <span
      className={`status-line status-line--${state === 'on' ? 'ok' : state === 'error' ? 'err' : 'off'}`}
    >
      {state === 'blocked' ? (
        <Lock className="integration-status__lock" aria-hidden="true" />
      ) : (
        <i className="status-line__dot" aria-hidden="true" />
      )}
      {t(`integr.status.${state}`)}
      {children && <span className="integration-status__note">{children}</span>}
    </span>
  );
}
