import { useId } from 'react';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { useModalDialog } from '../useModalDialog';
import './ConfirmDialog.css';

type Props = {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  /** Cancel button and Esc; a tap on the scrim does nothing. */
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = 'danger',
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useT();
  const id = useId();
  const dialog = useModalDialog(open, onCancel);

  return (
    <dialog
      ref={dialog.ref}
      className="confirm"
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={body ? `${id}-body` : undefined}
      onKeyDown={dialog.onKeyDown}
      onCancel={dialog.onCancel}
    >
      {open && (
        <>
          <h2 id={`${id}-title`} className="confirm__title">
            {title}
          </h2>
          {body && (
            <p id={`${id}-body`} className="confirm__body">
              {body}
            </p>
          )}
          <div className="confirm__actions">
            <Button variant="tonal" onClick={onCancel} data-autofocus>
              {t('common.cancel')}
            </Button>
            <Button variant={tone} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </>
      )}
    </dialog>
  );
}
