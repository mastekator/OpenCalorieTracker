import { useEffect, useRef } from 'react';

// Screens with unsaved edits; an update is never applied while this is above zero (ADR-0012).
let count = 0;
// «Save and leave» of the screen with edits; resolves true once saved.
let saver: (() => Promise<boolean>) | undefined;
/** Title and body of the leave dialog when the screen has its own (OCT-16 4.7). */
export type LeaveText = { title: string; body: string };
let text: (() => LeaveText) | undefined;

export const isDirty = () => count > 0;

/** Saves the screen with edits; false if it has no save or saving failed. */
export const saveDirty = () => saver?.() ?? Promise.resolve(false);

/** The dirty screen's leave dialog text; undefined: the shared «Save changes?». */
export const leaveText = () => text?.();

// Closing the tab asks only while there are edits: the listener alone can keep a page out of bfcache.
const onUnload = (e: BeforeUnloadEvent) => {
  e.preventDefault();
  e.returnValue = ''; // Safari and Chrome before 119 ignore preventDefault here
};

/** Marks unsaved edits; returns the release function. */
export function markDirty(
  save?: () => Promise<boolean>,
  leave?: () => LeaveText,
) {
  if (count++ === 0) addEventListener('beforeunload', onUnload);
  if (save) saver = save;
  if (leave) text = leave;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--count === 0) removeEventListener('beforeunload', onUnload);
    if (saver === save) saver = undefined;
    if (text === leave) text = undefined;
  };
}

/**
 * Keeps the app from updating while `flag` is true (edit, profile and agent
 * screens); leaving the screen asks first (OCT-22 8.19), `save` backs «Save and leave»,
 * `leave` replaces the dialog's title and body.
 */
export function useDirty(
  flag: boolean,
  save?: () => Promise<boolean>,
  leave?: LeaveText,
) {
  const latest = useRef(save);
  const latestText = useRef(leave);
  useEffect(() => {
    latest.current = save;
    latestText.current = leave;
  });
  const hasText = leave !== undefined;
  const hasSave = save !== undefined;
  useEffect(
    () =>
      flag
        ? markDirty(
            hasSave
              ? () => latest.current?.() ?? Promise.resolve(false)
              : undefined,
            hasText ? () => latestText.current! : undefined,
          )
        : undefined,
    [flag, hasSave, hasText],
  );
}
