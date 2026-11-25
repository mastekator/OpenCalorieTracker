import { isLocale } from '@oct/shared';
import { translate, type Key, type Params } from '../src/i18n/translate';
import { en } from '../src/i18n/locales/en';
import ru from '../src/i18n/locales/ru';

/** The toolbar language's string, so play functions find controls in RU and EN. */
export const tr = (
  globals: { locale?: unknown },
  key: Key,
  params?: Params,
) => {
  const locale = isLocale(globals.locale) ? globals.locale : 'en';
  return translate(locale, locale === 'ru' ? ru : en, key, params);
};
