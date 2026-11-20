import { useId, useRef, useState, type PointerEvent } from 'react';
import { Camera, CircleAlert, GripVertical } from 'lucide-react';
import { thumbUrl } from '../../data/thumbs';
import { useT } from '../../i18n';
import '../WeightStepper/WeightStepper.css';
import './StepEditorRow.css';

type Props = {
  /** 0-based position in the list. */
  index: number;
  text: string;
  photoId: string | null;
  /** A photo is uploading: its button is disabled. */
  busy?: boolean;
  autoFocus?: boolean;
  /** Under the text; also marks it invalid. */
  error?: string;
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
  error,
  onTextChange,
  onPhoto,
  onMenu,
  onMove,
}: Props) {
  const { t } = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLLIElement>(null);
  const dragged = useRef(false);
  const errorId = useId();
  const [dragging, setDragging] = useState(false);
  // Read by the window listeners of a drag in progress, which outlive this render.
  const latest = useRef({ index, onMove });
  latest.current = { index, onMove };
  const i = index + 1;

  // Listeners on window, not pointer capture: reordering moves this row in the DOM, which drops a capture.
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const startY = e.clientY;
    let moved = false;
    dragged.current = false;
    const move = (ev: globalThis.PointerEvent) => {
      if (!moved && Math.abs(ev.clientY - startY) < DRAG_SLOP) return;
      if (!moved) setDragging(true);
      moved = true;
      const self = row.current;
      const rows = [
        ...(self?.parentElement?.querySelectorAll(':scope > .step-item') ?? []),
      ];
      // Steps above the pointer, not counting this one: where this one belongs.
      const to = rows.filter((r) => {
        if (r === self) return false;
        const box = r.getBoundingClientRect();
        return box.top + box.height / 2 < ev.clientY;
      }).length;
      if (to !== latest.current.index) latest.current.onMove(to);
    };
    const end = () => {
      dragged.current = moved;
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  return (
    <li ref={row} className="list__item step-item">
      <div
        className={`list-row step-editor-row${dragging ? ' step-editor-row--dragging' : ''}`}
      >
        <span className="step-editor-row__n" aria-hidden="true">
          {i}
        </span>
        <div className="step-editor-row__body">
          <textarea
            className={`step-editor-row__text${error ? ' step-editor-row__text--error' : ''}`}
            aria-label={t('editor.step_text', { i })}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            placeholder={t('editor.step_ph')}
            value={text}
            maxLength={1000}
            rows={1}
            autoFocus={autoFocus}
            onChange={(e) => onTextChange(e.target.value)}
          />
          {error && (
            <p id={errorId} className="stepper__error" role="alert">
              <CircleAlert aria-hidden="true" />
              {error}
            </p>
          )}
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
