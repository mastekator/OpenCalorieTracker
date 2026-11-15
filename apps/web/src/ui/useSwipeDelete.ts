import {
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from 'react';

/** Below this a move is still a tap. */
const SLOP_PX = 8;
/** A full swipe past this share of the row deletes at once. */
const FULL_SWIPE = 0.6;
/** tan 30°: a steeper move is a scroll, not a swipe. */
const MAX_SLOPE = 0.577;

type Drag = { x: number; y: number; from: number; swiping?: boolean };

/**
 * Phone swipe-to-delete on a row (OCT-19 6.3, OCT-16 4.5): swipe left reveals the
 * `remove` button, a full swipe deletes at once. Touch and pen only: mouse rows show a
 * trash button. Spread `bind` on the row (it sets `--swipe-offset`); the row's CSS needs
 * `touch-action: pan-y` so vertical scrolling still works.
 */
export function useSwipeDelete(onDelete?: () => void) {
  // Row offset in px: 0 closed, −(delete width) open, anything between while dragging.
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  const swiped = useRef(false);
  const remove = useRef<HTMLButtonElement>(null);

  const bind = {
    style: { '--swipe-offset': `${offset}px` } as CSSProperties,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      swiped.current = false;
      if (!onDelete || event.pointerType === 'mouse') return;
      drag.current = { x: event.clientX, y: event.clientY, from: offset };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      const dx = event.clientX - d.x;
      const dy = event.clientY - d.y;
      if (d.swiping === undefined) {
        if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return;
        d.swiping = Math.abs(dy) < Math.abs(dx) * MAX_SLOPE;
        if (!d.swiping) return void (drag.current = null);
        swiped.current = true;
        setDragging(true);
      }
      setOffset(Math.min(0, d.from + dx));
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      drag.current = null;
      setDragging(false);
      if (!d?.swiping) return;
      const x = Math.min(0, d.from + event.clientX - d.x);
      const reveal = remove.current?.offsetWidth ?? 0;
      if (-x > event.currentTarget.offsetWidth * FULL_SWIPE) {
        setOffset(0);
        onDelete?.();
      } else setOffset(-x > reveal / 2 ? -reveal : 0);
    },
    onPointerCancel: () => {
      drag.current = null;
      setDragging(false);
      setOffset(0);
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      // A click that ends a swipe does nothing; a tap on an open row closes it.
      if (swiped.current) {
        swiped.current = false;
        event.stopPropagation();
      } else if (
        offset !== 0 &&
        !remove.current?.contains(event.target as Node)
      ) {
        event.stopPropagation();
        setOffset(0);
      }
    },
  };

  /** For the delete button's click: closes the row, then deletes. */
  const confirm = () => {
    setOffset(0);
    onDelete?.();
  };

  return { offset, dragging, remove, bind, confirm };
}
