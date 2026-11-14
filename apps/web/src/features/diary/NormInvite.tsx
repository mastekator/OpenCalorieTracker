import { Target } from 'lucide-react';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import './NormInvite.css';

/** «Set a daily goal» strip above the day total; no close button, it goes once a norm is set (OCT-19 2.3). */
export function NormInvite({ onSet }: { onSet: () => void }) {
  const { t } = useT();
  return (
    <div className="norm-invite">
      <Target className="norm-invite__icon" aria-hidden="true" />
      <span className="norm-invite__text">{t('norm.invite')}</span>
      <Button variant="plain" small onClick={onSet}>
        {t('norm.cta')}
      </Button>
    </div>
  );
}
