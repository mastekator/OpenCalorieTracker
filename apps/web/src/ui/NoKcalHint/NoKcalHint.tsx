import { Camera } from 'lucide-react';
import { useT } from '../../i18n';
import { Banner } from '../Banner/Banner';
import '../Button/Button.css';

type Props = {
  /** «Photograph the label»: the camera, the photo is read as this package's label only. */
  onShoot: () => void;
  /** The label photo is being read. */
  busy?: boolean;
};

/** OCT-313 2.4 (E-12): found by barcode without kcal and no nutrition table in the photo. */
export function NoKcalHint({ onShoot, busy }: Props) {
  const { t } = useT();
  return (
    <div aria-busy={busy || undefined}>
      <Banner
        tone="warning"
        actions={
          // aria-disabled, not disabled: loading keeps its colours and the focus.
          <button
            type="button"
            onClick={busy ? undefined : onShoot}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
          >
            {busy ? (
              <span className="button__spinner" aria-hidden="true" />
            ) : (
              <Camera aria-hidden="true" />
            )}
            {t(busy ? 'edit.reading_label' : 'edit.shoot_label')}
          </button>
        }
      >
        {t('edit.no_kcal')}
      </Banner>
    </div>
  );
}
