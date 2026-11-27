import { Camera, Image, Pencil } from 'lucide-react';
import { useT } from '../../i18n';
import { DeviceAiOffNote } from '../../ui/DeviceAiOffNote/DeviceAiOffNote';
import { List, ListRow } from '../../ui/List/List';
import { Sheet } from '../../ui/Sheet/Sheet';
import { AI_SETTINGS_PATH } from '../settings/AiScreen';
import './CaptureMenu.css';

type Props = {
  open: boolean;
  onClose: () => void;
  onPhoto: () => void;
  onGallery: () => void;
  onManual: () => void;
  /** «AI on this device» is off: the photo opens manual entry, the note says why (OCT-178 4.4). */
  aiOff?: boolean;
};

/** Menu 5.5: long press on the camera button. A shortcut, not the only way in. */
export function CaptureMenu({
  open,
  onClose,
  onPhoto,
  onGallery,
  onManual,
  aiOff,
}: Props) {
  const { t } = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t('nav.add_food')}>
      {aiOff && (
        <div className="capture-menu__ai-off">
          <DeviceAiOffNote href={AI_SETTINGS_PATH} onNavigate={onClose} />
        </div>
      )}
      <List>
        <ListRow icon={<Camera />} chevron={false} onClick={onPhoto}>
          {t('capture.menu.photo')}
        </ListRow>
        <ListRow icon={<Image />} chevron={false} onClick={onGallery}>
          {t('capture.menu.gallery')}
        </ListRow>
        <ListRow icon={<Pencil />} chevron={false} onClick={onManual}>
          {t('capture.menu.manual')}
        </ListRow>
      </List>
    </Sheet>
  );
}
