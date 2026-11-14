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
};
const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale] = useState(initialLocale);
  const [dict, setDict] = useState<Dict | null>(null);

  useEffect(() => {
    document.documentElement.lang = locale;
    // A failed chunk load (offline, stale deploy) falls back to English.
    loadDict(locale).then(setDict, () => loadDict('en').then(setDict));
  }, [locale]);

  if (!dict) return null;
  const t = (key: Key, params?: Params) => translate(locale, dict, key, params);
  // 'negative' keeps a rounded -0.3 from showing as "-0".
  const num = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    signDisplay: 'negative',
  }).format;
  return <I18nContext value={{ locale, t, num }}>{children}</I18nContext>;
}

export function useT() {
  const i18n = useContext(I18nContext);
  if (!i18n) throw new Error('useT outside I18nProvider');
  return i18n;
}
