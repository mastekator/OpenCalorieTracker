import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
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

type Props = {
  /** Time of the cached data shown offline («Offline · data from 12:40»). */
  dataTime?: string;
  /** The network is up but the server doesn't answer. */
  serverDown?: boolean;
};

/** Full-width status strip; the app shell decides where it sits. Empty when all is well. */
export function OfflineBar({ dataTime, serverDown = false }: Props) {
  const online = useOnline();
  const { t } = useT();
  const text = !online
    ? dataTime
      ? t('offline.bar', { time: dataTime })
      : t('offline.no_network')
    : serverDown
      ? t('offline.server_down')
      : null;
  // The live region stays mounted: screen readers skip regions inserted together with their text.
  return (
    <div className={text ? 'offline-bar' : undefined} role="status">
      {text && (
        <>
          <WifiOff aria-hidden="true" />
          <span>{text}</span>
        </>
      )}
    </div>
  );
}
