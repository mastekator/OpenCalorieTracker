import { mlToFlOz, type Units } from '@oct/shared';
import { useT } from '../../i18n';

/** A volume in the user's units: «250 ml» or «8.5 fl oz» (ADR-0028 §5). */
export function useVolume(units: Units) {
  const { t, locale } = useT();
  const oz = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const ml = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return (v: number) =>
    units === 'us'
      ? `${oz.format(mlToFlOz(v))}\u00a0${t('unit.fl_oz')}`
      : `${ml.format(v)}\u00a0${t('unit.ml')}`;
}
