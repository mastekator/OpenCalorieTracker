import { useCallback, useSyncExternalStore } from 'react';

/**
 * «AI on this device» (ADR-0031 §6, OCT-178 1.11): kept in this browser only, never sent to
 * the server. Off means nothing from this device goes to AI providers.
 */
const key = (userId: number) => `oct.deviceAi.${userId}`;

// `storage` fires in other tabs only; this tab hears its own writes here.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** On unless switched off; without a user, on. */
export const readDeviceAi = (userId?: number) =>
  userId === undefined || localStorage.getItem(key(userId)) !== '0';

export function setDeviceAi(userId: number, on: boolean) {
  if (on) localStorage.removeItem(key(userId));
  else localStorage.setItem(key(userId), '0');
  listeners.forEach((l) => l());
}

export function useDeviceAi(userId?: number) {
  const on = useSyncExternalStore(subscribe, () => readDeviceAi(userId));
  const set = useCallback(
    (value: boolean) => {
      if (userId !== undefined) setDeviceAi(userId, value);
    },
    [userId],
  );
  return [on, set] as const;
}
