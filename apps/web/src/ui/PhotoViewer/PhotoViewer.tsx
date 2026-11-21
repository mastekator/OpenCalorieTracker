import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Clock, Expand, WifiOff, X } from 'lucide-react';
import { useT } from '../../i18n';
import { useModalDialog } from '../useModalDialog';
import '../Button/Button.css';
import './PhotoViewer.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The cached preview: shown at once, and alone when the full photo is missing. */
  preview: string;
  /** `?size=full`, or null when the storage setting kept only the preview (ADR-0008). */
  full: string | null;
  /** Caption on top, e.g. the meal and its time. */
  title: string;
  alt: string;
};

/**
 * Full-screen photo (OCT-429). A plain <img> with the app URL, so the system
 * long-press menu and «Save image as…» save the full JPEG, not the preview.
 */
export function PhotoViewer({
  open,
  onClose,
  preview,
  full,
  title,
  alt,
}: Props) {
  const { t } = useT();
  const dialog = useModalDialog(open, onClose);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  );
  // Bumped by «Try again»: a new <img> requests the photo again.
  const [attempt, setAttempt] = useState(0);
  const autoRetried = useRef(false);
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y: number; t: number; moved: boolean } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    if (!open) return;
    setStatus('loading');
    setDy(0);
    autoRetried.current = false;
  }, [open, full]);

  const retry = () => {
    setStatus('loading');
    setAttempt((n) => n + 1);
  };

  // Back online: try once by itself (OCT-429 2.4).
  useEffect(() => {
    if (status !== 'error' || autoRetried.current) return;
    const onOnline = () => {
      autoRetried.current = true;
      retry();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [status]);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { y: e.clientY, t: e.timeStamp, moved: false };
    dragged.current = false;
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = Math.max(0, e.clientY - d.y);
    // A few px of jitter stay a tap or a long press, not a swipe.
    if (next > 8) d.moved = true;
    if (d.moved) setDy(next);
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    dragged.current = true;
    const distance = parseFloat(
      getComputedStyle(e.currentTarget).getPropertyValue(
        '--viewer-dismiss-distance',
      ),
    );
    const speed = dy / Math.max(1, e.timeStamp - d.t);
    if (dy > distance || speed > 0.5) onClose();
    else setDy(0);
  };

  const fullShown = !!full && status !== 'error';
  const loaded = fullShown && status === 'loaded';

  return (
    <dialog
      ref={dialog.ref}
      className={`viewer${dy ? ' viewer--drag' : ''}`}
      aria-label={alt}
      onKeyDown={dialog.onKeyDown}
      onCancel={dialog.onCancel}
      onClick={(e) => {
        // A tap on the black around the photo closes; the end of a swipe doesn't.
        if (dragged.current) return void (dragged.current = false);
        if (
          e.target === e.currentTarget ||
          (e.target as Element).matches('.viewer__stage')
        )
          onClose();
      }}
    >
      {open && (
        <>
          <div className="viewer__bar">
            <button
              type="button"
              className="viewer__button"
              aria-label={t('photoViewer.close')}
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </button>
            <span className="viewer__title tabular-nums">{title}</span>
            {fullShown && !loaded ? (
              <span
                className="viewer__status"
                role="status"
                aria-label={t('photoViewer.loading')}
              >
                <span className="button__spinner" aria-hidden="true" />
              </span>
            ) : (
              <span className="viewer__status" />
            )}
          </div>
          <div
            className="viewer__stage"
            style={dy ? { transform: `translateY(${dy}px)` } : undefined}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => {
              drag.current = null;
              setDy(0);
            }}
          >
            <img
              className={`viewer__photo viewer__preview${loaded ? ' viewer__preview--hidden' : ''}`}
              src={preview}
              alt={loaded ? '' : alt}
            />
            {fullShown && (
              <img
                key={attempt}
                className={`viewer__photo viewer__full${loaded ? '' : ' viewer__full--loading'}`}
                src={full}
                alt={loaded ? alt : ''}
                onLoad={() => setStatus('loaded')}
                onError={() => setStatus('error')}
              />
            )}
          </div>
          <div className="viewer__foot">
            {!full ? (
              <p className="viewer__note" role="note">
                <Clock aria-hidden="true" />
                <span>
                  <b>{t('photoViewer.expired.title')}</b>
                  {t('photoViewer.expired.body')}
                </span>
              </p>
            ) : status === 'error' ? (
              <>
                <p className="viewer__note" role="alert">
                  <WifiOff aria-hidden="true" />
                  <span>
                    <b>{t('photoViewer.error.title')}</b>
                    {t('photoViewer.error.body')}
                  </span>
                </p>
                <button type="button" className="viewer__retry" onClick={retry}>
                  {t('common.retry')}
                </button>
              </>
            ) : null}
          </div>
        </>
      )}
    </dialog>
  );
}

/** The corner mark on a thumbnail that opens the viewer; the thumbnail button gets `viewer-open`. */
export function ViewerMark() {
  return (
    <span className="viewer-mark" aria-hidden="true">
      <Expand />
    </span>
  );
}
