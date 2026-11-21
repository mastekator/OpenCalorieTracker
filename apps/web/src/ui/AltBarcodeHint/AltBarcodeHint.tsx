import { Barcode } from 'lucide-react';
import type { BarcodeResult } from '../../data/products';
import { useT } from '../../i18n';
import { Banner } from '../Banner/Banner';
import { missingNote } from '../BarcodeField/BarcodeField';
import '../Button/Button.css';

export type AltHintState =
  /** The offer: another code the AI read on the package; `product` when it has one. */
  | {
      kind: 'offer';
      code: string;
      product?: { name: string; kcal100: number; mine: boolean };
    }
  | { kind: 'searching'; code: string }
  /** The lookup after «Replace» answered; `ai`: the dish numbers are an AI estimate. */
  | { kind: 'result'; result: BarcodeResult; ai: boolean };

type Props = { state: AltHintState; onReplace: () => void };

/** «Dish» sheet under the source block: another barcode on the package (OCT-383, ADR-0036 §5). */
export function AltBarcodeHint({ state, onReplace }: Props) {
  const { t, num } = useT();
  if (state.kind === 'searching')
    return (
      <Banner icon={<span className="button__spinner" aria-hidden="true" />}>
        {t('edit.dish.alt.searching', { code: state.code })}
      </Banner>
    );
  if (state.kind === 'result') {
    const { result, ai } = state;
    if (result.product && result.from)
      return (
        <Banner tone="accent" icon={<Barcode aria-hidden="true" />}>
          {t(`manual_dish.barcode.found.${result.from}`)}
        </Banner>
      );
    const note = missingNote(result)!;
    return (
      <Banner tone={note === 'off_down' ? 'warning' : 'notice'}>
        {t(
          note === 'not_found' && ai
            ? 'edit.dish.alt.not_found_ai'
            : `edit.dish.alt.${note}`,
        )}
      </Banner>
    );
  }
  const { code, product } = state;
  return (
    <div role="group" aria-label={t('edit.dish.alt.group')}>
      <Banner
        tone="accent"
        icon={<Barcode aria-hidden="true" />}
        actions={
          <button
            type="button"
            onClick={onReplace}
            aria-label={
              product
                ? t('edit.dish.alt.replace_product', {
                    name: product.name,
                    code,
                  })
                : t('edit.dish.alt.replace_code', { code })
            }
          >
            {t('edit.dish.alt.replace')}
          </button>
        }
      >
        {product
          ? t('edit.dish.alt.found', { code, name: product.name })
          : t('edit.dish.alt.code', { code })}
        {product && (
          <>
            <br />
            {t('edit.dish.alt.meta', {
              src: t(
                product.mine
                  ? 'edit.dish.src.mine_undated'
                  : 'edit.dish.alt.off',
              ),
              kcal: t('meal.kcal', { n: num(product.kcal100) }),
            })}
          </>
        )}
      </Banner>
    </div>
  );
}
