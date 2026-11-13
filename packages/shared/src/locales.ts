/** Interface languages (ADR-0004). Adding one = a dictionary file in apps/web + its code here. */
export const LOCALES = ['en', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];

export const isLocale = (value: unknown): value is Locale =>
  LOCALES.includes(value as Locale);
