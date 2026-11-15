import { useEffect, useRef, type PointerEvent } from 'react';

/** A horizontal swipe longer than this turns the page. */
const SWIPE_PX = 60;
/** tan 30°: a steeper move is a scroll. */
const MAX_SLOPE = 0.577;

/**
 * Swipe and ← / → turn a pager (diary day, week, month; OCT-19 §3–5). `turn(-1 | 1)` decides
 * itself whether there is a page that way. A swipe starting inside `skip` is left to it.
 * Returns the pointer handlers for the swipe area.
 */
export function usePager(turn: (step: -1 | 1) => void, skip?: string) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const turnRef = useRef(turn);
  turnRef.current = turn;

  // Keys turn the page, unless typing or a dialog is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      const target = event.target;
      if (
        (target instanceof Element &&
          target.closest(
            'input, textarea, select, [contenteditable], [role="radiogroup"]',
          )) ||
        document.querySelector('dialog[open]')
      )
        return;
      if (event.key === 'ArrowLeft') turnRef.current(-1);
      if (event.key === 'ArrowRight') turnRef.current(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return {
    onPointerDown: (event: PointerEvent) => {
      const skipped = skip && (event.target as Element).closest(skip);
      start.current =
        event.pointerType === 'mouse' || skipped
          ? null
          : { x: event.clientX, y: event.clientY };
    },
    onPointerUp: (event: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = event.clientX - s.x;
      const dy = event.clientY - s.y;
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dy) < Math.abs(dx) * MAX_SLOPE)
        turnRef.current(dx > 0 ? -1 : 1);
    },
    onPointerCancel: () => (start.current = null),
  };
}
