import { Upload } from 'lucide-react';
import { useT } from '../../i18n';
import './DropOverlay.css';

/**
 * Whole-window drop target shown while a file is dragged over the app (design OCT-16 E.1).
 * Purely visual: the window listens for the drop, so it never catches pointer events.
 */
export function DropOverlay({ open }: { open: boolean }) {
  const { t } = useT();
  if (!open) return null;
  return (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-overlay__card">
        <span className="drop-overlay__icon">
          <Upload />
        </span>
        <p className="drop-overlay__title">{t('capture.drop')}</p>
        <p className="drop-overlay__formats">{t('capture.formats')}</p>
      </div>
    </div>
  );
}
