import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AwardKey } from '@oct/shared';
import { useT } from '../../i18n';
import { Medal } from '../Medal/Medal';
import './AwardToast.css';

/** An upward drag past this closes the strip. */
const SWIPE_PX = 24;
/** Overlapped medals in the «New awards: n» strip; the count is in the text. */
const STACK = 3;

/**
 * The «New award» strip at the top (OCT-184 1.2): not modal, closes by «Close» or a swipe up.
 * The live region stays mounted empty, so screen readers announce the strip when it appears.
 */
export function AwardToast({
  awards,
  onOpen,
  onClose,
}: {
  /** Nothing to show: an empty region. */
  awards: AwardKey[];
  /** «View» / «All awards». */
  onOpen: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const start = useRef<number | null>(null);
  const [dy, setDy] = useState(0);
  const one = awards.length === 1 ? awards[0] : undefined;
  const end = () => {
    start.current = null;
    setDy(0);
  };

  return (
    <div className="award-toast" role="status">
      {awards.length > 0 && (
        <div
          className="award-toast__inner"
          style={dy ? { translate: `0 ${dy}px` } : undefined}
          onPointerDown={(e) => {
            if ((e.target as Element).closest('button')) return;
            start.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (start.current !== null)
              setDy(Math.min(0, e.clientY - start.current));
          }}
          onPointerUp={() => {
            if (dy < -SWIPE_PX) onClose();
            end();
          }}
          onPointerCancel={end}
        >
          {one ? (
            <Medal awardKey={one} state="got" size="sm" />
          ) : (
            <span className="award-toast__stack">
              {awards.slice(0, STACK).map((key) => (
                <Medal key={key} awardKey={key} state="got" size="sm" />
              ))}
            </span>
          )}
          <span className="award-toast__text">
            <b>
              {one
                ? t('awards.toast_one')
                : t('awards.toast_many', { n: awards.length })}
            </b>
            {one && (
              <span>{t(`award.${one}.name` as 'award.weeks_1.name')}</span>
            )}
          </span>
          <button
            type="button"
            className="award-toast__action"
            onClick={onOpen}
          >
            {one ? t('awards.view') : t('awards.all')}
          </button>
          <button
            type="button"
            className="award-toast__close"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
