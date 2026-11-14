import { useCallback, useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
import { isServerDown, subscribeServerDown } from '../api/client';
import { useT } from '../i18n';
import { useOnline, type BarVariant } from '../ui/OfflineBar/OfflineBar';
import { useToast } from '../ui/Toast/Toast';

const STALE_KEY = 'update.stale';
const staleListeners = new Set<() => void>();
const setStale = (on: boolean) => {
  if (on) sessionStorage.setItem(STALE_KEY, '1');
  else sessionStorage.removeItem(STALE_KEY);
  staleListeners.forEach((l) => l());
};
/** Before the reload caused by client_outdated: the bar asks to save again (OCT-25 6.2). */
export const markStale = () => setStale(true);
/** The save went through: the bar goes. */
export const clearStale = () => setStale(false);
const subscribeStale = (l: () => void) => {
  staleListeners.add(l);
  return () => void staleListeners.delete(l);
};

/** Which bar shows, if any: no network first, then a silent server, then a rejected old version. */
export function barVariant(
  online: boolean,
  serverDown: boolean,
  stale: boolean,
): BarVariant | null {
  if (!online) return 'offline';
  if (serverDown) return 'server';
  return stale ? 'updated' : null;
}

export function useBarVariant() {
  const online = useOnline();
  const serverDown = useSyncExternalStore(subscribeServerDown, isServerDown);
  const stale = useSyncExternalStore(
    subscribeStale,
    () => sessionStorage.getItem(STALE_KEY) !== null,
  );
  return barVariant(online, serverDown, stale);
}

const BLOCKED_TOAST_MS = 4000;

export type OnlineReason = 'agent' | 'auth' | 'admin';

/**
 * Actions that run on the server (OCT-25 3.6): online they run, offline a toast tells why.
 * The buttons stay visible; `requireOnline(reason, action)` replaces their handler.
 */
export function useRequireOnline() {
  const online = useOnline();
  const toast = useToast();
  const { t } = useT();
  return useCallback(
    (reason: OnlineReason, action: () => void) => () =>
      online
        ? action()
        : toast({
            text: t(`offline.blocked.${reason}`),
            icon: <WifiOff />,
            duration: BLOCKED_TOAST_MS,
          }),
    [online, toast, t],
  );
}
