import { useSyncExternalStore } from 'react';
import { isInAppBrowser } from './link';

/** Which install sheet an iPhone gets; null: no hint (not iOS, or already installed). */
export type InstallPlatform = 'safari' | 'other-browser';

type Env = {
  ua: string;
  /** `navigator.standalone` or `display-mode: standalone`. */
  standalone: boolean;
  /** `navigator.maxTouchPoints`: iPadOS Safari reports a Mac user agent. */
  touchPoints: number;
};

// iOS browsers other than Safari; EdgiOS also carries `Version/`.
const OTHER_IOS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo/;

/** Design OCT-25 §10. shortcut: a user-agent heuristic; an unknown webview gets the Safari steps, which is harmless. */
export function installPlatform({
  ua,
  standalone,
  touchPoints,
}: Env): InstallPlatform | null {
  const ios =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  if (!ios || standalone) return null;
  const safari =
    /Version\/[\d.]+.*Safari\//.test(ua) &&
    !OTHER_IOS.test(ua) &&
    !isInAppBrowser(ua);
  return safari ? 'safari' : 'other-browser';
}

export const currentInstallPlatform = () =>
  installPlatform({
    ua: navigator.userAgent,
    standalone:
      (navigator as { standalone?: boolean }).standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches === true,
    touchPoints: navigator.maxTouchPoints,
  });

const HIDE_KEY = 'install-hint-hidden-at';
export const HIDE_MS = 30 * 24 * 60 * 60 * 1000;

/** × on the card hides it for 30 days on this device (AC-1.4); a broken value counts as not hidden. */
export function isInstallHidden(now: number) {
  const age = now - Number(localStorage.getItem(HIDE_KEY) ?? NaN);
  return age >= 0 && age < HIDE_MS;
}

export const hideInstall = (now: number) =>
  localStorage.setItem(HIDE_KEY, String(now));

/** Where the app lives, for «Copy address»: the base path, not a guess about the host. */
export const appUrl = () =>
  new URL(import.meta.env.BASE_URL, location.href).href;

// Android and desktop: the system install dialog (AC-1.6).
type InstallPromptEvent = Event & { prompt: () => Promise<unknown> };
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const set = (event: InstallPromptEvent | null) => {
  deferred = event;
  listeners.forEach((l) => l());
};

/** Call before the first render: the browser fires `beforeinstallprompt` once, early. */
export function listenInstallPrompt() {
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    set(event as InstallPromptEvent);
  });
  addEventListener('appinstalled', () => set(null));
}

/** For the «Install» row in Settings: shown only when the browser offered installing. */
export function useInstallPrompt() {
  const event = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => deferred,
  );
  return {
    canInstall: event !== null,
    install: async () => {
      if (!event) return;
      set(null); // an event prompts once, whatever the answer
      await event.prompt();
    },
  };
}
