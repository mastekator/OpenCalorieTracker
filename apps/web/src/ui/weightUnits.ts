import { gToOz, ozToG, round1, type Units } from '@oct/shared';
import { useT } from '../i18n';

/**
 * Kitchen weights (AC-2.6): grams in state, API and the database, the user's
 * units on screen. Typed ounces go to grams unrounded in ounces (no drift).
 */
export const weightIn = (units: Units = 'metric') => {
  const us = units === 'us';
  return {
    us,
    show: (g: number) => (us ? gToOz(g) : g),
    toG: (n: number) => (us ? ozToG(n) : round1(n)),
  };
};

/** `weightIn` plus the unit label and grams formatted for display: whole grams, ounces to 0.1. */
export function useWeight(units?: Units) {
  const { t, locale } = useT();
  const w = weightIn(units);
  const format = new Intl.NumberFormat(locale, {
    maximumFractionDigits: w.us ? 1 : 0,
  });
  return {
    ...w,
    u: t(w.us ? 'unit.oz' : 'unit.g'),
    fmt: (g: number) => format.format(w.show(g)),
  };
}
