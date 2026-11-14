import { useSyncExternalStore } from 'react';
import { RefreshCw, ServerOff, WifiOff } from 'lucide-react';
import { useT } from '../../i18n';
import './OfflineBar.css';

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

/** navigator.onLine, kept in sync with the online/offline events. */
export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine);
}

/** `no_network`: sign-in screens, where nothing is saved offline. */
export type BarVariant = 'offline' | 'server' | 'updated' | 'no_network';

const BARS = {
  offline: { icon: WifiOff, text: 'offline.bar' },
  server: { icon: ServerOff, text: 'offline.server' },
  updated: { icon: RefreshCw, text: 'update.stale' },
  no_network: { icon: WifiOff, text: 'offline.no_network' },
} as const;

/**
 * Full-width status strip under the status bar (OCT-25 3.1, 3.2, 6.2); the app picks the variant
 * (app/connection). Never takes focus; empty when all is well.
 */
export function OfflineBar({ variant }: { variant: BarVariant | null }) {
  const { t } = useT();
  const bar = variant && BARS[variant];
  // The live region stays mounted: screen readers skip regions inserted together with their text.
  return (
    <div className={bar ? 'offline-bar' : undefined} role="status">
      {bar && (
        <>
          <bar.icon aria-hidden="true" />
          <span>{t(bar.text)}</span>
        </>
      )}
    </div>
  );
}
