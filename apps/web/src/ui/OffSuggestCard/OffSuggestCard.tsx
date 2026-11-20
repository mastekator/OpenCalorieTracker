import { Barcode } from 'lucide-react';
import { useT } from '../../i18n';
import { Banner } from '../Banner/Banner';

type Props = {
  /** Opens the consent sheet (OCT-313 4.4). */
  onEnable: () => void;
  /** Not again for 30 days. */
  onLater: () => void;
};

/** OCT-313 2.5: a barcode in the photo while the user's Open Food Facts lookup is off. */
export function OffSuggestCard({ onEnable, onLater }: Props) {
  const { t } = useT();
  return (
    <Banner
      tone="accent"
      icon={<Barcode aria-hidden="true" />}
      actions={
        <>
          <button type="button" onClick={onEnable}>
            {t('integr.turn_on')}
          </button>
          <button type="button" onClick={onLater}>
            {t('integr.not_now')}
          </button>
        </>
      }
    >
      {t('edit.off_suggest')}
    </Banner>
  );
}
