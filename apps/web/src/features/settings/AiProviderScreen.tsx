import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, WifiOff } from 'lucide-react';
import { adminAiStatusSchema, type AdminAiStatus } from '@oct/shared';
import { api, ApiError, type ClientErrorCode } from '../../api/client';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { ProviderStatus } from '../../ui/ProviderStatus/ProviderStatus';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { useToast } from '../../ui/Toast/Toast';

export const AI_STATUS_PATH = '/api/admin/ai';

const codeOf = (err: unknown): ClientErrorCode =>
  err instanceof ApiError ? err.code : 'internal';

/** Admin «AI provider» (OCT-25 §5): live status only, never a stale copy (E-6.2). */
export function AiProviderScreen() {
  const { t } = useT();
  const toast = useToast();
  const online = useOnline();
  const [status, setStatus] = useState<AdminAiStatus | null>(null);
  const [loadError, setLoadError] = useState<ClientErrorCode | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setStatus(await api(AI_STATUS_PATH, adminAiStatusSchema));
    } catch (err) {
      setLoadError(codeOf(err));
    }
  }, []);
  // Re-read when the network comes back: offline shows no data at all.
  useEffect(() => {
    if (online) void load();
    else setStatus(null);
  }, [online, load]);

  async function check() {
    setChecking(true);
    try {
      setStatus(
        await api(`${AI_STATUS_PATH}/check`, adminAiStatusSchema, {
          method: 'POST',
        }),
      );
    } catch (err) {
      const code = codeOf(err);
      if (code === 'too_many_attempts') {
        const sec = ((err as ApiError).details as { retryAfterSec?: unknown })
          ?.retryAfterSec;
        toast({
          text: t('ai.wait', { count: typeof sec === 'number' ? sec : 10 }),
        });
      } else if (code === 'ai_not_configured') void load();
      else toast({ text: t(`errors.${code}`) });
    } finally {
      setChecking(false);
    }
  }

  if (!online)
    return (
      <ScreenState
        icon={<WifiOff />}
        title={t('ai.offline.title')}
        role="status"
      >
        {t('ai.offline.body')}
      </ScreenState>
    );
  if (loadError)
    return (
      <ScreenState
        icon={<CircleAlert />}
        tone="danger"
        title={t(`errors.${loadError}`)}
        action={
          <Button variant="tonal" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  // Under 300 ms nothing is shown (OCT-13 §3).
  if (!status) return null;
  return (
    <ProviderStatus
      status={status}
      checking={checking}
      onCheck={() => void check()}
    />
  );
}
