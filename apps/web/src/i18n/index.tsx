import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { isLocale, type Locale } from '@oct/shared';
import {
  loadDict,
  pickLocale,
  translate,
  type Dict,
  type Key,
  type Params,
} from './translate';

/** Last chosen language, for the next cold start (written by settings, OCT-6). */
export const LOCALE_STORAGE_KEY = 'oct.locale';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // localStorage unavailable: fall through to the browser languages.
  }
  return pickLocale(navigator.languages);
}

type I18n = {
  locale: Locale;
  t: (key: Key, params?: Params) => string;
  /** Whole number for display (AC-0.3): values stay unrounded until shown. */
  num: (value: number) => string;
  /** Switches the language now, without a reload, and remembers it on this device. */
  setLocale: (locale: Locale) => void;
};
const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [wanted, setWanted] = useState(initialLocale);
  // The shown locale changes together with its dictionary: no frame of mixed languages.
  const [loaded, setLoaded] = useState<{ locale: Locale; dict: Dict } | null>(
    null,
  );

  useEffect(() => {
    let live = true;
    const show = (dict: Dict) => {
      if (!live) return;
      document.documentElement.lang = wanted;
      setLoaded({ locale: wanted, dict });
    };
    // A failed chunk load (offline, stale deploy) falls back to English.
    loadDict(wanted).then(show, () => loadDict('en').then(show));
    return () => {
      live = false;
    };
  }, [wanted]);

  if (!loaded) return null;
  const { locale, dict } = loaded;
  const setLocale = (next: Locale) => {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Not remembered on this device; the server copy still syncs it.
    }
    setWanted(next);
  };
  const t = (key: Key, params?: Params) => translate(locale, dict, key, params);
  // 'negative' keeps a rounded -0.3 from showing as "-0".
  const num = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    signDisplay: 'negative',
  }).format;
  return (
    <I18nContext value={{ locale, t, num, setLocale }}>{children}</I18nContext>
  );
}

export function useT() {
  const i18n = useContext(I18nContext);
  if (!i18n) throw new Error('useT outside I18nProvider');
  return i18n;
}
