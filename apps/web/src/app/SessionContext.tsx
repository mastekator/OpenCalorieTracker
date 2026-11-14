import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { TriangleAlert, WifiOff } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import { meResponseSchema, type MeResponse } from '@oct/shared';
import {
  api,
  ApiError,
  ME_PATH,
  setUnauthenticatedHandler,
} from '../api/client';
import {
  clearLocal,
  getLastUser,
  readOfflineUser,
  setLastUser,
} from '../data/user';
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

/** Exported for stories that render signed-in screens without a server. */
export const SessionContext = createContext<Session | null>(null);

/** Another user signed in on this device: the previous one's local data goes first (AC-2.7). */
async function rememberUser(me: MeResponse) {
  const last = getLastUser();
  if (last?.id === me.id) return;
  // shortcut: drops the previous user's unsent changes silently; OCT-77 adds alert 3.8 first.
  if (last) await clearLocal(last.id);
  setLastUser(me);
  void navigator.storage?.persist?.().catch(() => {});
}

/** The last user's local copy, when there is one to start from without a network (E-8.10). */
const offlineUser = () => readOfflineUser().catch(() => null);

/**
 * Loads GET /api/auth/me; children render once it is known whether the user is signed in.
 * Without a network the last user starts from the local copy, unchecked.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [user, setUser] = useState<MeResponse | null | undefined>();
  const [error, setError] = useState<ApiError | null>(null);
  const [noCopy, setNoCopy] = useState(false);
  const [path, navigate] = useLocation();
  const search = useSearch();

  const refresh = useCallback(async () => {
    setNoCopy(false);
    try {
      const me = await api(ME_PATH, meResponseSchema);
      await rememberUser(me);
      setUser(me);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setError(null);
        return;
      }
      // No network, or the server behind a proxy is down (502/503): the local copy still opens.
      if (err instanceof ApiError && (err.status === 0 || err.status >= 500)) {
        const local = await offlineUser();
        if (local) {
          setUser(local);
          setError(null);
          return;
        }
        setNoCopy(err.status === 0);
      }
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

  // shortcut: plain offline screen; its final look comes with the offline UI task.
  if (error && user === undefined)
    return (
      <main className="page">
        <ScreenState
          icon={noCopy ? <WifiOff /> : <TriangleAlert />}
          tone={noCopy ? 'neutral' : 'danger'}
          title={noCopy ? t('offline.no_network') : t(`errors.${error.code}`)}
          children={noCopy && t('offline.first_run')}
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
