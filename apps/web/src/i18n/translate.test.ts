import { LOCALES } from '@oct/shared';
import { describe, expect, it } from 'vitest';
import { en } from './locales/en';
import ru from './locales/ru';
import {
  COMPLETE_LOCALES,
  loadDict,
  missingKeys,
  pickLocale,
  translate,
} from './translate';

describe('translate', () => {
  it('substitutes {name} params and keeps unknown ones', () => {
    expect(translate('en', en, 'common.tryAgainIn', { count: 1 })).toBe(
      'Try again in 1 minute',
    );
    expect(
      translate('en', { common: { loading: '{x} {y}' } }, 'common.loading', {
        x: 'a',
      }),
    ).toBe('a {y}');
  });

  it('picks plural forms with Intl.PluralRules', () => {
    const minutes = (locale: 'en' | 'ru', count: number) =>
      translate(locale, locale === 'en' ? en : ru, 'common.tryAgainIn', {
        count,
      });
    expect(minutes('en', 2)).toBe('Try again in 2 minutes');
    expect(minutes('ru', 1)).toBe('Повторите через 1 минуту');
    expect(minutes('ru', 2)).toBe('Повторите через 2 минуты');
    expect(minutes('ru', 5)).toBe('Повторите через 5 минут');
    expect(minutes('ru', 21)).toBe('Повторите через 21 минуту');
  });

  it('falls back to en for a missing key', () => {
    expect(translate('ru', {}, 'screens.login')).toBe('Sign in');
  });

  it('gives the generic text for an unknown API error code', () => {
    expect(translate('ru', ru, 'errors.brand_new' as 'errors.internal')).toBe(
      ru.errors!.internal,
    );
  });

  it('rejects a mistyped key at compile time', () => {
    // @ts-expect-error: 'screens.logn' is not a key of en (typecheck fails if this compiles)
    expect(translate('en', en, 'screens.logn')).toBe('screens.logn');
  });
});

describe('dictionaries', () => {
  it.each(LOCALES)('%s: completeness', async (locale) => {
    const missing = missingKeys(locale, await loadDict(locale));
    if (COMPLETE_LOCALES.includes(locale)) expect(missing).toEqual([]);
    else if (missing.length) console.info(`[i18n] ${locale} missing:`, missing);
  });

  it('reports missing keys and plural categories', () => {
    const partial = { common: { tryAgainIn: { one: 'x', other: 'y' } } };
    const missing = missingKeys('ru', partial);
    expect(missing).toContain('screens.login');
    expect(missing).toContain('common.tryAgainIn.few');
    expect(missing).not.toContain('common.tryAgainIn.one');
  });
});

describe('pickLocale', () => {
  it.each([
    [['ru-RU'], 'ru'],
    [['pt-BR', 'ru'], 'ru'],
    [['de'], 'en'],
    [['EN-gb'], 'en'],
    [[], 'en'],
  ])('%j → %s', (languages, locale) => {
    expect(pickLocale(languages)).toBe(locale);
  });
});
