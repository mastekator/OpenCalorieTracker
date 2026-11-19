import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { List, ListRow } from '../List/List';
import { Sheet } from '../Sheet/Sheet';
import './BarcodeConsentSheet.css';

type Props = {
  open: boolean;
  /** The caller writes `offEnabled` (and `offHintAt` for «Not now»), OCT-313 4.4. */
  onEnable: () => void;
  onClose: () => void;
};

/** OCT-313 4.4: what turning on the lookup sends, before it is on. */
export function BarcodeConsentSheet({ open, onEnable, onClose }: Props) {
  const { t } = useT();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('integr.barcode.title')}
      footer={
        <>
          <Button onClick={onEnable}>{t('integr.turn_on')}</Button>
          <Button variant="plain" onClick={onClose}>
            {t('integr.not_now')}
          </Button>
        </>
      }
    >
      <div className="consent-sheet">
        <p>{t('integr.barcode.sheet_text')}</p>
        <List>
          {(['what', 'from', 'never'] as const).map((k) => (
            <ListRow key={k} description={t(`integr.barcode.kv.${k}_v`)}>
              {t(`integr.barcode.kv.${k}`)}
            </ListRow>
          ))}
        </List>
      </div>
    </Sheet>
  );
}
