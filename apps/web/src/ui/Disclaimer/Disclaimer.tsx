import { Info, X } from 'lucide-react';
import { useT } from '../../i18n';
import './Disclaimer.css';

type Props = {
  /** Shows the 44×44 «Hide this notice» button (OCT-22 §1). */
  onHide?: () => void;
};

/** «This is an estimate, not medical advice» under the norm (AC-0.3). */
export function Disclaimer({ onHide }: Props) {
  const { t } = useT();
  return (
    <div className="disclaimer">
      <Info aria-hidden="true" />
      <p>{t('norm.disclaimer')}</p>
      {onHide && (
        <button
          type="button"
          className="disclaimer__hide"
          aria-label={t('norm.disclaimer_hide')}
          onClick={onHide}
        >
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
