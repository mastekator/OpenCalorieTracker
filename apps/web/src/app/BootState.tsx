import { CircleAlert, WifiOff } from 'lucide-react';
import type { ApiError } from '../api/client';
import { useT } from '../i18n';
import { Button } from '../ui/Button/Button';
import { ScreenState } from '../ui/ScreenState/ScreenState';
import { Delayed, Skeleton } from '../ui/Skeleton/Skeleton';

type Props = {
  /** null: still loading. */
  error: ApiError | null;
  /** A line under the error title. */
  hint?: string;
  onRetry: () => void;
};

/** What a startup provider shows before its data: a delayed skeleton, or the error with a retry. */
export function BootState({ error, hint, onRetry }: Props) {
  const { t } = useT();
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
  const network = error.code === 'network';
  return (
    <main className="page" role="alert">
      <ScreenState
        icon={network ? <WifiOff /> : <CircleAlert />}
        tone={network ? 'neutral' : 'danger'}
        title={t(`errors.${error.code}`)}
        children={hint}
        action={
          <Button variant="tonal" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        }
      />
    </main>
  );
}
