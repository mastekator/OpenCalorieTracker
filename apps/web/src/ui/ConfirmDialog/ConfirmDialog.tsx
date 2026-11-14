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
  /** Defaults to «Cancel»; e.g. «Close» (3.8) or «Stay» (leave with edits). */
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  /** Cancel button and Esc; a tap on the scrim does nothing. */
  onCancel: () => void;
  /**
   * Optional third action (danger-plain), e.g. «Don't save». With it the
   * buttons stack and focus starts on Cancel, the safe action (OCT-22 8.16).
   */
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  onConfirm,
  onCancel,
  secondaryLabel,
  onSecondary,
}: Props) {
  const { t } = useT();
  const id = useId();
  const dialog = useModalDialog(open, onCancel);
  const three = secondaryLabel !== undefined;
  const cancel = (
    <Button
      variant={three ? 'plain' : 'tonal'}
      onClick={onCancel}
      data-autofocus={three || undefined}
    >
      {cancelLabel ?? t('common.cancel')}
    </Button>
  );

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
          <h2
            id={`${id}-title`}
            className="confirm__title"
            tabIndex={-1}
            data-autofocus={!three || undefined}
          >
            {title}
          </h2>
          {body && (
            <p id={`${id}-body`} className="confirm__body">
              {body}
            </p>
          )}
          {three ? (
            <div className="confirm__actions confirm__actions--stack">
              <Button variant={tone} onClick={onConfirm}>
                {confirmLabel}
              </Button>
              <Button variant="danger-plain" onClick={onSecondary}>
                {secondaryLabel}
              </Button>
              {cancel}
            </div>
          ) : (
            <div className="confirm__actions">
              {cancel}
              <Button variant={tone} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
          )}
        </>
      )}
    </dialog>
  );
}
