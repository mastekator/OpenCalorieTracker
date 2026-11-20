import { Camera } from 'lucide-react';
import { useT } from '../../i18n';
import { Banner } from '../Banner/Banner';

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
    <Banner
      tone="warning"
      actions={
        <button type="button" onClick={onShoot} disabled={busy}>
          <Camera aria-hidden="true" />
          {t('edit.shoot_label')}
        </button>
      }
    >
      {t('edit.no_kcal')}
    </Banner>
  );
}
