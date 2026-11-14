import { useId, useRef, type PointerEvent, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { useModalDialog } from '../useModalDialog';
import './Sheet.css';

type Props = {
  open: boolean;
  /** Close button, Esc, tap on the scrim and swipe down only call this; the screen closes it. */
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Actions pinned under the content. */
  footer?: ReactNode;
  /** Full screen on the phone, 88 % high and wider on desktop (chat, D.2). */
  full?: boolean;
};

const SWIPE_CLOSE_PX = 80;

/** Bottom sheet on the phone, centred dialog from 1024px (styles/layout.css). */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  full = false,
}: Props) {
  const { t } = useT();
  const titleId = useId();
  const { ref, onKeyDown, onCancel } = useModalDialog(open, onClose);
  const startY = useRef<number | null>(null);

  // Swipe only from the handle and header, so scrolling the content never fights it.
  const drag = (event: PointerEvent, end: boolean) => {
    const dialog = ref.current;
    if (!dialog || startY.current === null) return;
    const dy = Math.max(0, event.clientY - startY.current);
    if (!end) {
      dialog.style.transform = `translateY(${dy}px)`;
      return;
    }
    startY.current = null;
    dialog.style.transform = '';
    if (dy > SWIPE_CLOSE_PX) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={full ? 'sheet sheet--full' : 'sheet'}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      onCancel={onCancel}
      // The dialog box has no padding, so a click on the dialog itself is the scrim.
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      {open && (
        <div className="sheet__panel">
          <div
            className="sheet__grab"
            onPointerDown={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest('button')
              )
                return;
              startY.current = event.clientY;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => drag(event, false)}
            onPointerUp={(event) => drag(event, true)}
            onPointerCancel={(event) => drag(event, true)}
          >
            <div className="sheet__handle" aria-hidden="true" />
            <div className="sheet__header">
              <h2
                id={titleId}
                className="sheet__title"
                tabIndex={-1}
                data-autofocus
              >
                {title}
              </h2>
              <button
                type="button"
                className="sheet__close"
                aria-label={t('common.close')}
                onClick={onClose}
              >
                {/* Lucide `x` */}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="sheet__body">{children}</div>
          {footer && <div className="sheet__footer">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
