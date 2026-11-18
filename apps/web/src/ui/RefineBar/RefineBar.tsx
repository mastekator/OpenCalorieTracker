import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Check, RefreshCw, Sparkle, Undo2 } from 'lucide-react';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import './RefineBar.css';

/** As refineRequestSchema's `text` (AC-2.1). */
const REFINE_TEXT_MAX = 300;
/** The counter shows from here on (OCT-234 A.3: «50 left» at 250). */
const COUNTER_FROM = REFINE_TEXT_MAX - 50;

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** No photo to read: the placeholder asks what was eaten (AC-4.2). */
  textOnly?: boolean;
  onRefine: () => void;
  /** «Recognize again»; none: no photo on the server or the model reads no photos. */
  onAgain?: () => void;
  /** A request is running; `slow` after 10 s. */
  busy?: 'busy' | 'slow';
  /** What is running: «Recognize again» has its own busy text (OCT-234 B.3). */
  mode?: 'refine' | 'again';
  onCancel: () => void;
  /** Offline or the photo still queued: the field takes text, the buttons wait. */
  disabled?: boolean;
  /** Why the buttons wait, or that the photo is gone; under the field. */
  note?: ReactNode;
  /** An error banner above the field; the text stays (AC-2.8). */
  error?: ReactNode;
  /** After a successful step: the strip with «Undo» (OCT-234 C); `answered`: an answer chip (H.2). */
  result?: {
    kcalDelta: number;
    removed: string[];
    onUndo: () => void;
    answered?: boolean;
  };
};

/** «What should I fix?» above Save on the edit screen (OCT-234 A–D, ADR-0020 §9). */
export function RefineBar({
  value,
  onChange,
  textOnly,
  onRefine,
  onAgain,
  busy,
  mode,
  onCancel,
  disabled,
  note,
  error,
  result,
}: Props) {
  const { t, num } = useT();
  const [focused, setFocused] = useState(false);
  // The textarea unmounts while busy, so its blur never fires (OCT-234 C.1: back to one line).
  if (busy && focused) setFocused(false);
  const noteId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const resultKey = result
    ? `${result.kcalDelta}|${result.removed.join()}`
    : '';
  const keyAtStart = useRef<string | null>(null);
  // Focus would fall to <body> with the unmounted field (WCAG 2.4.3):
  // a new result → its strip, cancel or error → back to the field.
  useEffect(() => {
    if (busy) {
      // Only on idle → busy: the field just unmounted; busy → slow keeps focus where it is.
      if (keyAtStart.current === null) cancelRef.current?.focus();
      keyAtStart.current ??= resultKey;
      return;
    }
    if (keyAtStart.current === null) return;
    const before = keyAtStart.current;
    keyAtStart.current = null;
    const fresh = !error && resultKey && resultKey !== before;
    (fresh ? resultRef : fieldRef).current?.focus();
  }, [busy, resultKey, error]);
  const text = value.trim();
  // A.1: one line until used; the buttons show once there is something to send or explain.
  const open = focused || !!value || !!error;
  const delta = result
    ? `${result.kcalDelta > 0 ? '+' : result.kcalDelta < 0 ? '−' : '±'}${num(Math.abs(result.kcalDelta))} ${t('today.kcal')}`
    : '';
  // Clicking a button must not blur the field first: its row would fold under the pointer.
  const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();
  return (
    <div className="refine">
      {result && (
        <div
          ref={resultRef}
          className="refine__result"
          role="status"
          tabIndex={-1}
        >
          <Check aria-hidden="true" className="refine__result-icon" />
          <p className="refine__result-text">
            <span className="refine__result-title">
              {t(
                result.answered
                  ? 'edit.refine.answered'
                  : 'edit.refine.updated',
              )}
            </span>
            <span className="tabular-nums">
              {[
                delta,
                result.removed.length > 0 &&
                  t('edit.refine.removed', {
                    names: result.removed.join(', '),
                  }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </p>
          <span className="refine__undo">
            <Button variant="plain" small onClick={result.onUndo}>
              <Undo2 aria-hidden="true" />
              {t('edit.refine.undo')}
            </Button>
          </span>
        </div>
      )}
      {error}
      {busy ? (
        <div className="refine__busy" role="status">
          <span className="button__spinner" aria-hidden="true" />
          <span className="refine__busy-text">
            {t(
              busy === 'slow'
                ? 'edit.refine.slow'
                : mode === 'again'
                  ? 'edit.refine.busy_again'
                  : 'edit.refine.busy',
            )}
            {text && <span className="refine__query">«{text}»</span>}
          </span>
          <Button ref={cancelRef} variant="plain" small onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : (
        <>
          <label className="refine__field">
            <Sparkle aria-hidden="true" className="refine__icon" />
            <textarea
              ref={fieldRef}
              className="refine__input"
              rows={1}
              maxLength={REFINE_TEXT_MAX}
              aria-label={t('edit.refine.label')}
              aria-describedby={note ? noteId : undefined}
              placeholder={t(
                textOnly
                  ? 'edit.refine.placeholder_text'
                  : focused
                    ? 'edit.refine.placeholder'
                    : 'edit.refine.label',
              )}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          </label>
          {value.length >= COUNTER_FROM && (
            <p className="refine__note tabular-nums" aria-live="polite">
              {t('edit.refine.left', {
                n: num(REFINE_TEXT_MAX - value.length),
              })}
            </p>
          )}
          {open && (
            <div className="refine__actions">
              {onAgain && (
                <Button
                  variant="tonal"
                  small
                  disabled={disabled}
                  onMouseDown={keepFocus}
                  onClick={onAgain}
                >
                  <RefreshCw aria-hidden="true" />
                  {t('edit.refine.again')}
                </Button>
              )}
              <Button
                small
                variant={text ? 'primary' : 'tonal'}
                disabled={disabled || !text}
                onMouseDown={keepFocus}
                onClick={onRefine}
              >
                {t('edit.refine.refine')}
                <ArrowUp aria-hidden="true" />
              </Button>
            </div>
          )}
        </>
      )}
      {note && (
        <p id={noteId} className="refine__note">
          {note}
        </p>
      )}
    </div>
  );
}
