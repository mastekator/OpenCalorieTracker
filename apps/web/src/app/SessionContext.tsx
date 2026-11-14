import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useSearch } from 'wouter';
import { meResponseSchema, type MeResponse } from '@oct/shared';
import {
  api,
  ApiError,
  ME_PATH,
  setUnauthenticatedHandler,
} from '../api/client';
import { z } from 'zod';
import {
  clearLocal,
  getLastUser,
  pendingOf,
  readOfflineUser,
  setLastUser,
} from '../data/user';
import { useT } from '../i18n';
import { ConfirmDialog } from '../ui/ConfirmDialog/ConfirmDialog';
import { BootState } from './BootState';
import { isPublicPath, loginHref } from './next';

type Session = {
  /** null: not signed in. */
  user: MeResponse | null;
  /** Re-reads the session, e.g. after sign-in or sign-out. */
  refresh: () => Promise<void>;
};

/** Exported for stories that render signed-in screens without a server. */
export const SessionContext = createContext<Session | null>(null);

function rememberUser(me: MeResponse) {
  setLastUser(me);
  void navigator.storage?.persist?.().catch(() => {});
}

/** Another account signed in while the previous one still has unsent changes (3.8). */
type Switch = { me: MeResponse; last: { id: number; email: string }; count: number };

/** The last user's local copy, when there is one to start from without a network (E-8.10). */
const offlineUser = () => readOfflineUser().catch(() => null);

/**
 * Loads GET /api/auth/me; children render once it is known whether the user is signed in.
 * Without a network the last user starts from the local copy, unchecked.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null | undefined>();
  const [error, setError] = useState<ApiError | null>(null);
  const [switching, setSwitching] = useState<Switch | null>(null);
  const { t } = useT();
  const [path, navigate] = useLocation();
  const search = useSearch();

  const refresh = useCallback(async () => {
    try {
      const me = await api(ME_PATH, meResponseSchema);
      const last = getLastUser();
      // Another user on this device: the previous one's local data goes first (AC-2.7).
      if (last && last.id !== me.id) {
        const count = await pendingOf(last.id).catch(() => 0);
        if (count > 0) {
          // Nothing of the new user is written locally until the user decides.
          setSwitching({ me, last, count });
          setUser(null);
          setError(null);
          return;
        }
        await clearLocal(last.id);
      }
      if (last?.id !== me.id) rememberUser(me);
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
      }
      setError(err instanceof ApiError ? err : new ApiError(0, 'internal'));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const retry = useCallback(() => {
    setError(null);
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

  async function confirmSwitch({ me, last }: Switch) {
    await clearLocal(last.id);
    rememberUser(me);
    setSwitching(null);
    setUser(me);
  }

  async function cancelSwitch() {
    await api('/api/auth/logout', z.unknown(), { method: 'POST' }).catch(
      () => {},
    );
    setSwitching(null);
  }

  if (user === undefined) return <BootState error={error} onRetry={retry} />;
  return (
    <SessionContext value={{ user, refresh }}>
      {children}
      <ConfirmDialog
        open={!!switching}
        title={t('switch_user.title')}
        body={
          switching
            ? t('switch_user.body', {
                count: switching.count,
                email: switching.last.email,
              })
            : undefined
        }
        confirmLabel={t('switch_user.ok')}
        onConfirm={() => switching && void confirmSwitch(switching)}
        onCancel={() => void cancelSwitch()}
      />
    </SessionContext>
  );
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession outside SessionProvider');
  return session;
}
