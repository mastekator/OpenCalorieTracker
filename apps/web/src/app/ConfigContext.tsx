import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { configResponseSchema, type ConfigResponse } from '@oct/shared';
import { api, ApiError } from '../api/client';
import { useT } from '../i18n';

const ConfigContext = createContext<ConfigResponse | null>(null);

/** Loads GET /api/config once; children render only when it is available. */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    api('/api/config', configResponseSchema).then(setConfig, (err) =>
      setError(err instanceof ApiError ? err : new ApiError(0, 'internal')),
    );
  }, []);

  // shortcut: plain text states until ui/ScreenState lands (OCT-31).
  if (error)
    return (
      <main className="page" role="alert">
        {t(`errors.${error.code}`)}
      </main>
    );
  if (!config) return <main className="page">{t('common.loading')}</main>;
  return <ConfigContext value={config}>{children}</ConfigContext>;
}

export function useConfig() {
  const config = useContext(ConfigContext);
  if (!config) throw new Error('useConfig outside ConfigProvider');
  return config;
}
