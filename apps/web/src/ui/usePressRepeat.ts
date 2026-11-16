import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

/** Long press: first repeat after 400 ms, then every 100 ms (OCT-16 4.2). */
const REPEAT_DELAY_MS = 400;
const REPEAT_EVERY_MS = 100;

/**
 * − / + buttons that step on press and repeat while held. `step` runs with the latest props;
 * at an edge it should call `stop`, as the disabled button may never get pointerup.
 */
export function usePressRepeat(step: (dir: 1 | -1) => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stepRef = useRef(step);
  stepRef.current = step;
  const stop = () => clearTimeout(timer.current);
  useEffect(() => stop, []);

  const press = (dir: 1 | -1) => {
    stepRef.current(dir);
    const repeat = (delay: number) => {
      timer.current = setTimeout(() => {
        stepRef.current(dir);
        repeat(REPEAT_EVERY_MS);
      }, delay);
    };
    repeat(REPEAT_DELAY_MS);
  };

  const bind = (dir: 1 | -1) => ({
    onPointerDown: (e: PointerEvent) => {
      if (e.button === 0) press(dir);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    // Keyboard Enter/Space click (detail 0); pointer clicks already stepped on press.
    onClick: (e: MouseEvent) => {
      if (e.detail === 0) stepRef.current(dir);
    },
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  });
  return { bind, stop };
}
