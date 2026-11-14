import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { TriangleAlert } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import { meResponseSchema, type MeResponse } from '@oct/shared';
import {
  api,
  ApiError,
  ME_PATH,
  setUnauthenticatedHandler,
} from '../api/client';
import { useT } from '../i18n';
import { Button } from '../ui/Button/Button';
import { ScreenState } from '../ui/ScreenState/ScreenState';
import { isPublicPath, loginHref } from './next';

type Session = {
  /** null: not signed in. */
  user: MeResponse | null;
  /** Re-reads the session, e.g. after sign-in or sign-out. */
  refresh: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

/** Loads GET /api/auth/me; children render once it is known whether the user is signed in. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [user, setUser] = useState<MeResponse | null | undefined>();
  const [error, setError] = useState<ApiError | null>(null);
  const [path, navigate] = useLocation();
  const search = useSearch();

  const refresh = useCallback(async () => {
    try {
      setUser(await api(ME_PATH, meResponseSchema));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setError(null);
      } else
        setError(err instanceof ApiError ? err : new ApiError(0, 'internal'));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Session expired mid-use: back to sign-in, then return here (AC-5.3).
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      if (isPublicPath(path)) return;
      navigate(loginHref(search ? `${path}?${search}` : path, true), {
        replace: true,
      });
      setUser(null);
    });
    return () => setUnauthenticatedHandler(() => {});
  }, [path, search, navigate]);

  // shortcut: offline start without cache shows the error; OCT-76 starts from IndexedDB.
  if (error && user === undefined)
    return (
      <main className="page">
        <ScreenState
          icon={<TriangleAlert />}
          tone="danger"
          title={t(`errors.${error.code}`)}
          action={
            <Button
              variant="tonal"
              onClick={() => {
                setError(null);
                void refresh();
              }}
            >
              {t('common.retry')}
            </Button>
          }
        />
      </main>
    );
  if (user === undefined)
    return <main className="page">{t('common.loading')}</main>;
  return <SessionContext value={{ user, refresh }}>{children}</SessionContext>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession outside SessionProvider');
  return session;
}
