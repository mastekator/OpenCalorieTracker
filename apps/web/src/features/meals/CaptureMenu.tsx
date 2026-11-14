import { Camera, Image, Pencil } from 'lucide-react';
import { useT } from '../../i18n';
import { List, ListRow } from '../../ui/List/List';
import { Sheet } from '../../ui/Sheet/Sheet';

type Props = {
  open: boolean;
  onClose: () => void;
  onPhoto: () => void;
  onGallery: () => void;
  onManual: () => void;
};

/** Menu 5.5: long press on the camera button. A shortcut, not the only way in. */
export function CaptureMenu({
  open,
  onClose,
  onPhoto,
  onGallery,
  onManual,
}: Props) {
  const { t } = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t('nav.add_food')}>
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
