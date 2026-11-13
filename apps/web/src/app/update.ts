import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { setOutdatedHandler } from '../api/client';
import { createUpdater } from './updater';

const STALE_KEY = 'update.stale';
const draftKey = () => `draft:${location.pathname}`;
const drafts = new Map<string, () => unknown>();

/** Registers the service worker and the silent update policy. Call once at startup. */
export function startUpdates() {
  if (!('serviceWorker' in navigator)) return;
  let registration: ServiceWorkerRegistration | undefined;
  const updateSW = registerSW({
    onNeedRefresh: () => updater.needRefresh(),
    onRegisteredSW: (_url, r) => {
      registration = r;
    },
  });
  const updater = createUpdater({
    apply: () => void updateSW(true),
    check: () => registration?.update() ?? Promise.resolve(),
    installing: () => Boolean(registration?.installing),
    reload: () => location.reload(),
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updater.visible();
  });
  let reloading = false; // several in-flight writes can all get client_outdated
  setOutdatedHandler(() => {
    if (reloading) return;
    reloading = true;
    for (const [key, get] of drafts)
      sessionStorage.setItem(key, JSON.stringify(get()));
    sessionStorage.setItem(STALE_KEY, '1');
    void updater.outdated();
  });
}

/**
 * Keeps the screen's unsaved value for a reload into a new version (client_outdated):
 * saved to sessionStorage as draft:<route>, handed to `restore` once after the reload.
 */
export function useDraft<T>(value: T, restore: (draft: T) => void) {
  const current = useRef(value);
  current.current = value;
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(() => {
    const key = draftKey();
    const saved = sessionStorage.getItem(key);
    if (saved !== null) {
      sessionStorage.removeItem(key);
      restoreRef.current(JSON.parse(saved) as T);
    }
    drafts.set(key, () => current.current);
    return () => {
      drafts.delete(key);
    };
  }, []);
}

/** True after a reload caused by client_outdated, until dismissed (bar `update.stale`, OCT-78). */
export function useUpdateStale() {
  const [stale, setStale] = useState(
    () => sessionStorage.getItem(STALE_KEY) !== null,
  );
  const dismiss = useCallback(() => {
    sessionStorage.removeItem(STALE_KEY);
    setStale(false);
  }, []);
  return [stale, dismiss] as const;
}
