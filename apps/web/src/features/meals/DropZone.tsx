import { Pencil, Upload } from 'lucide-react';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { useCapture } from './CaptureContext';
import './DropZone.css';

/** Today's second column on the desktop (OCT-16 E.1): drop or paste a photo, pick a file, or enter manually. */
export function DropZone() {
  const { t } = useT();
  const capture = useCapture();
  // The window itself catches drops and pastes (CaptureProvider); this is the visible target.
  return (
    <section className="drop-zone" aria-label={t('nav.add_food')}>
      <span className="drop-zone__icon" aria-hidden="true">
        <Upload />
      </span>
      <p className="drop-zone__hint">{t('capture.drop_hint')}</p>
      <p className="drop-zone__formats">{t('capture.formats')}</p>
      <div className="drop-zone__actions">
        <Button variant="tonal" onClick={capture.pick}>
          {t('nav.add_food')}
        </Button>
        <Button variant="plain" onClick={capture.manual}>
          <Pencil aria-hidden="true" />
          {t('common.manual_full')}
        </Button>
      </div>
    </section>
  );
}
