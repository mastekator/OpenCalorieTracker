import {
  daysBetween,
  round1,
  weightFromKg,
  type Units,
  type Weighing,
} from '@oct/shared';
import { useT } from '../../i18n';

/** Joins a number and its unit, and the parts of a date. */
export const NB = ' ';
const MINUS = '−';

/** Weight and date formatting shared by the weight card and the weight screen (OCT-189 §5). */
export function useWeightFormat(units: Units) {
  const { t, locale } = useT();
  const unit = t(units === 'us' ? 'unit.lb' : 'unit.kg');
  // Built once per render, not per value: the list formats thousands of rows.
  const dateFormat = (options: Intl.DateTimeFormatOptions) => {
    const f = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
    return (d: string) =>
      f.format(new Date(`${d}T00:00:00Z`)).replaceAll(' ', NB);
  };
  const short = dateFormat({ day: 'numeric', month: 'short' });
  const shortYear = dateFormat({
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const long = dateFormat({ weekday: 'short', day: 'numeric', month: 'short' });
  const n1f = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const n1 = (v: number) => n1f.format(v);
  /** kg → the user's units, as shown: one decimal. */
  const shown = (kg: number) => round1(weightFromKg(kg, units));
  /** Signed number, no color or arrow (AC-9.17); «0.0» has no sign. */
  const signed = (v: number) => {
    const d = round1(v);
    return `${d > 0 ? '+' : d < 0 ? MINUS : ''}${n1(Math.abs(d))}`;
  };
  return {
    unit,
    n1,
    shown,
    signed,
    short,
    shortYear,
    /** A goal reads «73 kg», «160.9 lb». */
    n01: (v: number) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v),
    /** «80.2 kg» */
    weight: (kg: number) => `${n1(shown(kg))}${NB}${unit}`,
    /** «Thu, Nov 12» */
    day: (d: string) => {
      const s = long(d);
      return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
    },
    /** «today», «yesterday», «3 days ago» */
    when: (d: string, today: string) => {
      const ago = daysBetween(d, today);
      return ago <= 0
        ? t('weight_card.today')
        : ago === 1
          ? t('weight_card.yesterday')
          : t('weight_card.days_ago', { count: ago });
    },
    /** «−0.4 kg since Nov 12», or «First weigh-in». */
    since: (latest: Weighing, prev: Weighing | undefined) =>
      prev
        ? t('weight_card.since', {
            diff: `${signed(shown(latest.weightKg) - shown(prev.weightKg))}${NB}${unit}`,
            date: short(prev.date),
          })
        : t('weight_card.first'),
  };
}
