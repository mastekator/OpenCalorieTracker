import {
  flOzToMl,
  gToOz,
  mlToFlOz,
  ozToG,
  round1,
  type DishUnit,
  type Units,
} from '@oct/shared';
import { useT } from '../i18n';

/**
 * Kitchen weights (AC-2.6): grams or millilitres (ADR-0038) in state, API and the
 * database, the user's units on screen: oz or fl oz in the US system. Typed ounces
 * go to grams unrounded in ounces (no drift).
 */
export const weightIn = (units: Units = 'metric', unit: DishUnit = 'g') => {
  const us = units === 'us';
  const ml = unit === 'ml';
  return {
    us,
    ml,
    show: (g: number) => (us ? (ml ? mlToFlOz : gToOz)(g) : g),
    toG: (n: number) => (us ? (ml ? flOzToMl : ozToG)(n) : round1(n)),
  };
};

/** 'ml' or nothing: a record without `unit` reads as grams (ADR-0038 §4). */
export const unitOf = (unit?: string | null) =>
  unit === 'ml' ? { unit: 'ml' as const } : {};

const LABELS = {
  g: ['unit.g', 'unit.oz'],
  ml: ['unit.ml', 'unit.fl_oz'],
} as const;

/**
 * `weightIn` plus the unit label and amounts formatted for display: whole g / ml,
 * ounces to 0.1. `as` gives the same for another unit, e.g. per recipe ingredient.
 */
export function useWeight(units?: Units, unit: DishUnit = 'g') {
  const { t, locale } = useT();
  const as = (unit: DishUnit = 'g') => {
    const w = weightIn(units, unit);
    const format = new Intl.NumberFormat(locale, {
      maximumFractionDigits: w.us ? 1 : 0,
    });
    const u = t(LABELS[unit][w.us ? 1 : 0]);
    const fmt = (g: number) => format.format(w.show(g));
    return {
      ...w,
      u,
      fmt,
      /** «500 ml», «16.9 fl oz»: the amount with its unit, never broken apart. */
      text: (g: number) => `${fmt(g)}\u00a0${u}`,
    };
  };
  return { ...as(unit), as };
}
