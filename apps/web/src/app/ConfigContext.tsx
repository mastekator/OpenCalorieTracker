import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { configResponseSchema, type ConfigResponse } from '@oct/shared';
import { api, ApiError } from '../api/client';
import { BootState } from './BootState';

const ConfigContext = createContext<ConfigResponse | null>(null);

/** Loads GET /api/config; children render only when it is available. */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(() => {
    setError(null);
    api('/api/config', configResponseSchema).then(setConfig, (err) =>
      setError(err instanceof ApiError ? err : new ApiError(0, 'internal')),
    );
  }, []);

  useEffect(load, [load]);

  if (!config) return <BootState error={error} onRetry={load} />;
  return <ConfigContext value={config}>{children}</ConfigContext>;
}

export function useConfig() {
  const config = useContext(ConfigContext);
  if (!config) throw new Error('useConfig outside ConfigProvider');
  return config;
}
