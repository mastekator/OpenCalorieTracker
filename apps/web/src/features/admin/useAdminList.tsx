import { useCallback, useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import type { z } from 'zod';
import { api, ApiError, type ClientErrorCode } from '../../api/client';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { useToast } from '../../ui/Toast/Toast';

export const codeOf = (err: unknown): ClientErrorCode =>
  err instanceof ApiError ? err.code : 'internal';

/** Loads an admin list; `act` runs a write and, if it fails (a race: 404, 409), toasts and reloads. */
export function useAdminList<T>(path: string, schema: z.ZodType<T[]>) {
  const { t } = useT();
  const toast = useToast();
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<ClientErrorCode | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api(path, schema));
    } catch (err) {
      setError(codeOf(err));
    }
  }, [path, schema]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (write: () => Promise<unknown>, done: string) => {
    try {
      await write();
      toast({ text: done });
    } catch (err) {
      toast({ text: t(`errors.${codeOf(err)}`) });
    }
    await load();
  };

  const failed = error && (
    <ScreenState
      icon={<CircleAlert />}
      tone="danger"
      title={t(`errors.${error}`)}
      action={
        <Button variant="tonal" onClick={() => void load()}>
          {t('common.retry')}
        </Button>
      }
    />
  );
  return { items, setItems, load, act, failed };
}

/** «12 Nov» (with the year when not the current one); `time` adds hours and minutes. */
export function formatDate(locale: string, ms: number, time = false) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(new Date(ms).getFullYear() !== new Date().getFullYear() && {
      year: 'numeric',
    }),
    ...(time && { hour: '2-digit', minute: '2-digit' }),
  }).format(ms);
}
