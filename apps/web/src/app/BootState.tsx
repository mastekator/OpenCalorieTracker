import { useEffect } from 'react';
import { CircleAlert, WifiOff } from 'lucide-react';
import type { ApiError } from '../api/client';
import { useT } from '../i18n';
import { Button } from '../ui/Button/Button';
import { ScreenState } from '../ui/ScreenState/ScreenState';
import { Delayed, Skeleton } from '../ui/Skeleton/Skeleton';

type Props = {
  /** null: still loading. */
  error: ApiError | null;
  onRetry: () => void;
};

/**
 * What a startup provider shows before its data: a delayed skeleton, or the error with a retry.
 * No network here means no local copy to start from: 3.4 «First sign-in needs a connection»,
 * which retries by itself once the network is back (OCT-25 3.4).
 */
export function BootState({ error, onRetry }: Props) {
  const { t } = useT();
  const network = error?.code === 'network';

  useEffect(() => {
    if (!network) return;
    window.addEventListener('online', onRetry);
    return () => window.removeEventListener('online', onRetry);
  }, [network, onRetry]);

  if (!error)
    return (
      <main className="page" aria-busy="true">
        <Delayed>
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <Skeleton width="60%" />
            <Skeleton />
            <Skeleton />
          </div>
        </Delayed>
      </main>
    );
  return (
    <main className="page" role="alert">
      <ScreenState
        icon={network ? <WifiOff /> : <CircleAlert />}
        tone={network ? 'neutral' : 'danger'}
        title={t(network ? 'offline.first.title' : `errors.${error.code}`)}
        children={network ? t('offline.first.body') : undefined}
        action={
          <Button variant="tonal" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        }
      />
    </main>
  );
}
