import { useRef, useState, type PointerEvent } from 'react';
import { Camera, GripVertical } from 'lucide-react';
import { thumbUrl } from '../../data/thumbs';
import { useT } from '../../i18n';
import './StepEditorRow.css';

type Props = {
  /** 0-based position in the list. */
  index: number;
  text: string;
  photoId: string | null;
  /** A photo is uploading: its button is disabled. */
  busy?: boolean;
  autoFocus?: boolean;
  onTextChange: (text: string) => void;
  onPhoto: (file: File) => void;
  /** Tap on the handle (also Enter / VoiceOver): «Move up / Move down / Delete». */
  onMenu: () => void;
  /** Dragging the handle over another step's middle. */
  onMove: (to: number) => void;
};

/** Pointer travel before a press on the handle becomes a drag, px. */
const DRAG_SLOP = 6;

/** One step in the recipe editor (OCT-160 2.4): number, text, photo, drag handle. */
export function StepEditorRow({
  index,
  text,
  photoId,
  busy = false,
  autoFocus,
  onTextChange,
  onPhoto,
  onMenu,
  onMove,
}: Props) {
  const { t } = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const [dragging, setDragging] = useState(false);
  const i = index + 1;

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientY - d.y) < DRAG_SLOP) return;
    if (!d.moved) setDragging(true);
    d.moved = true;
    const row = e.currentTarget.closest('.list__item');
    const rows = [
      ...(row?.parentElement?.querySelectorAll(':scope > .step-item') ?? []),
    ];
    // Steps above the pointer, not counting this one: where this one belongs.
    const to = rows.filter((r) => {
      if (r === row) return false;
      const box = r.getBoundingClientRect();
      return box.top + box.height / 2 < e.clientY;
    }).length;
    if (to !== index) onMove(to);
  };
  const onPointerEnd = () => {
    dragged.current = !!drag.current?.moved;
    drag.current = null;
    setDragging(false);
  };

  return (
    <li className="list__item step-item">
      <div
        className={`list-row step-editor-row${dragging ? ' step-editor-row--dragging' : ''}`}
      >
        <span className="step-editor-row__n" aria-hidden="true">
          {i}
        </span>
        <div className="step-editor-row__body">
          <textarea
            className="step-editor-row__text"
            aria-label={t('editor.step_text', { i })}
            value={text}
            maxLength={1000}
            rows={1}
            autoFocus={autoFocus}
            onChange={(e) => onTextChange(e.target.value)}
          />
          <div className="step-editor-row__photo">
            {photoId && <img src={thumbUrl(photoId)} alt="" />}
            <button
              type="button"
              className="step-editor-row__photo-button"
              aria-label={t(
                photoId
                  ? 'editor.step_photo_replace_label'
                  : 'editor.step_photo_add_label',
                { i },
              )}
              aria-busy={busy}
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              <Camera aria-hidden="true" />
              {t(photoId ? 'editor.step_photo_replace' : 'editor.step_photo')}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onPhoto(file);
              }}
            />
          </div>
        </div>
        <button
          type="button"
          className="step-editor-row__grip"
          aria-label={t('editor.step_move', { i })}
          aria-haspopup="dialog"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClick={() => {
            // The click that ends a drag is not a tap.
            if (dragged.current) dragged.current = false;
            else onMenu();
          }}
        >
          <GripVertical aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
