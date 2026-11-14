import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import './SaveBar.css';

type Props = {
  /** The new goal as text («1 810 kcal»); null when there's none yet (8.3). */
  preview: string | null;
  onSave: () => void;
  /** A field has an error (8.11). */
  disabled?: boolean;
  loading?: boolean;
};

/**
 * Phone: bar above the tab bar with the live preview, shown while there are
 * edits (AC-1.2). Desktop (D.1): a plain Save button in the sticky column.
 */
export function SaveBar({ preview, onSave, disabled, loading }: Props) {
  const { t } = useT();
  return (
    <div className="save-bar">
      <p className="save-bar__preview">
        <small>{t(preview === null ? 'save.none' : 'save.preview')}</small>
        {preview !== null && <b>{preview}</b>}
      </p>
      <Button onClick={onSave} disabled={disabled} loading={loading}>
        {t(loading ? 'save.saving' : 'save.action')}
      </Button>
    </div>
  );
}
