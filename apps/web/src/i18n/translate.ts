import { isLocale, type Locale } from '@oct/shared';
import { en } from './locales/en';

type Plural = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>;
type Node = string | Plural;

/** Other languages: any subset of `en`; plurals may use any CLDR categories. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Node
    ? T[K] extends string
      ? string
      : Plural
    : DeepPartial<T[K]>;
};
export type Dict = DeepPartial<typeof en>;

type Keys<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Node
    ? `${P}${K}`
    : Keys<T[K], `${P}${K}.`>;
}[keyof T & string];
export type Key = Keys<typeof en>;
export type Params = Record<string, string | number>;

/** Languages that must be fully translated; others may ship partially. */
export const COMPLETE_LOCALES: readonly Locale[] = ['en', 'ru'];

const lookup = (dict: unknown, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      dict,
    );

export function translate(
  locale: Locale,
  dict: Dict,
  key: Key,
  params: Params = {},
): string {
  let node = lookup(dict, key) ?? lookup(en, key);
  // An API error code unknown to this client gets the generic text.
  if (node === undefined)
    return key.startsWith('errors.')
      ? translate(locale, dict, 'errors.internal')
      : key;
  if (typeof node === 'object') {
    const plural = node as Plural;
    node =
      plural[new Intl.PluralRules(locale).select(Number(params.count))] ??
      plural.other;
  }
  return (node as string).replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

/** Keys of `en` absent from `dict`, including plural categories the language needs. */
export function missingKeys(locale: Locale, dict: Dict): string[] {
  const categories = new Intl.PluralRules(locale).resolvedOptions()
    .pluralCategories;
  const walk = (source: object, prefix: string): string[] =>
    Object.entries(source).flatMap(([name, value]) => {
      const key = prefix + name;
      if (typeof value === 'string')
        return typeof lookup(dict, key) === 'string' ? [] : [key];
      if ('other' in value) {
        const node = lookup(dict, key) as Plural | undefined;
        return categories
          .filter((c) => typeof node?.[c] !== 'string')
          .map((c) => `${key}.${c}`);
      }
      return walk(value, `${key}.`);
    });
  return walk(en, '');
}

/** Before sign-in: first browser language whose base code we ship, else `en`. */
export const pickLocale = (languages: readonly string[]): Locale =>
  languages.map((tag) => tag.split('-')[0]!.toLowerCase()).find(isLocale) ??
  'en';

// Non-en dictionaries are split into their own chunks and loaded on demand.
const loaders = import.meta.glob<Dict>(['./locales/*.ts', '!./locales/en.ts'], {
  import: 'default',
});

export const loadDict = (locale: Locale): Promise<Dict> =>
  locale === 'en' ? Promise.resolve(en) : loaders[`./locales/${locale}.ts`]!();
