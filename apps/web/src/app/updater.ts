import { isDirty } from './dirty';

export const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;

export interface ServiceWorkerControls {
  /** skipWaiting + reload into the waiting version. */
  apply(): void;
  /** registration.update(). */
  check(): Promise<unknown>;
  /** A new version is downloading right now. */
  installing(): boolean;
  reload(): void;
}

/** Silent update policy (design OCT-25 §6, ADR-0012); kept DOM-free for tests. */
export function createUpdater(sw: ServiceWorkerControls, now = Date.now) {
  let ready = false;
  let forced = false;
  let lastCheck = now();

  return {
    /** onNeedRefresh: a new version is waiting. */
    needRefresh() {
      ready = true;
      if (forced) sw.apply();
    },
    /** visibilitychange → visible. */
    visible() {
      if (ready) {
        if (!isDirty()) sw.apply();
        return;
      }
      if (now() - lastCheck < UPDATE_CHECK_INTERVAL) return;
      lastCheck = now();
      sw.check().catch(() => {});
    },
    /** The server rejected this client (client_outdated): get the new version now. */
    async outdated() {
      forced = true;
      if (ready) return sw.apply();
      await sw.check().catch(() => {});
      // A download in progress ends in needRefresh, which applies it.
      if (!ready && !sw.installing()) sw.reload();
    },
  };
}
