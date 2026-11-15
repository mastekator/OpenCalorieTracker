import { ChevronRight, X } from 'lucide-react';
import { useT } from '../../i18n';
import './InstallCard.css';

type Props = {
  onOpen: () => void;
  /** × hides the hint for 30 days; the screen decides. */
  onHide: () => void;
};

/** 2.1 «Add to your Home Screen» card on Today, above the day total (OCT-25 §2). */
export function InstallCard({ onOpen, onHide }: Props) {
  const { t } = useT();
  return (
    <section className="install-card" aria-labelledby="install-card-title">
      <img
        className="install-card__icon"
        src={`${import.meta.env.BASE_URL}pwa-192x192.png`}
        alt=""
      />
      <div className="install-card__text">
        <h2 id="install-card-title" className="install-card__title">
          {t('install.card.title')}
        </h2>
        <p className="install-card__body">{t('install.card.body')}</p>
        <button type="button" className="install-card__go" onClick={onOpen}>
          {t('install.card.cta')}
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        className="install-card__close"
        aria-label={t('install.card.hide')}
        onClick={onHide}
      >
        <X aria-hidden="true" />
      </button>
    </section>
  );
}
