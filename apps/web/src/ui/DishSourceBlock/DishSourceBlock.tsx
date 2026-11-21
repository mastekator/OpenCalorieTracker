import { Barcode, Bookmark, ExternalLink, ScanText } from 'lucide-react';
import { normalizeGtin, type DishUnit, type Nutrients } from '@oct/shared';
import { useT } from '../../i18n';
import type { PackageKind } from '../SourceBadge/SourceBadge';
import './DishSourceBlock.css';

type Props = {
  /** `code`: an AI dish with another barcode on offer, only its code shows (OCT-383 3.4). */
  kind: PackageKind | 'code';
  code: string | null;
  /** The dish as found or read: its numbers per 100 g (or 100 ml) are shown. */
  original: Nutrients & { grams: number; unit?: DishUnit };
  /** `mine`: when the product was saved (ISO); none if it is not on this device. */
  savedAt?: string;
};

const ICON = {
  barcode: Barcode,
  code: Barcode,
  label: ScanText,
  mine: Bookmark,
};

/**
 * «Dish» sheet: where a package dish's numbers come from (OCT-313 2.6). For Open Food
 * Facts this is also the attribution its ODbL license asks for, with a link to the product.
 */
export function DishSourceBlock({ kind, code, original, savedAt }: Props) {
  const { t, num, locale } = useT();
  const Icon = ICON[kind];
  const per100 = (v: number) =>
    num(original.grams > 0 ? (v / original.grams) * 100 : 0);
  // Only a valid code goes into the URL.
  const gtin = kind === 'barcode' && code ? normalizeGtin(code) : null;
  return (
    <section className="dish-source">
      <p className="dish-source__title">
        <Icon aria-hidden="true" />
        {kind === 'barcode'
          ? t('edit.dish.src.off')
          : kind === 'code'
            ? t('edit.dish.src.code')
            : kind === 'label'
              ? t('edit.dish.src.label')
              : savedAt
                ? t('edit.dish.src.mine', {
                    date: new Intl.DateTimeFormat(locale, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }).format(new Date(savedAt)),
                  })
                : t('edit.dish.src.mine_undated')}
      </p>
      {code && <p className="dish-source__code tabular-nums">{code}</p>}
      {kind !== 'code' && (
        <p className="tabular-nums">
          {t(
            original.unit === 'ml' ? 'edit.dish.per100_ml' : 'edit.dish.per100',
            {
              kcal: t('meal.kcal', { n: per100(original.kcal) }),
              macros: t('edit.macros', {
                p: per100(original.proteinG),
                f: per100(original.fatG),
                c: per100(original.carbsG),
              }),
            },
          )}
        </p>
      )}
      {gtin && (
        <a
          className="dish-source__link"
          href={`https://world.openfoodfacts.org/product/${gtin}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('edit.dish.open_off')}
          <ExternalLink aria-hidden="true" />
        </a>
      )}
    </section>
  );
}
