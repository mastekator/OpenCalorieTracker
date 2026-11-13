import { useEffect } from 'react';

// Screens with unsaved edits; an update is never applied while this is above zero (ADR-0012).
let count = 0;

export const isDirty = () => count > 0;

/** Marks unsaved edits; returns the release function. */
export function markDirty() {
  count++;
  let released = false;
  return () => {
    if (!released) count--;
    released = true;
  };
}

/** Keeps the app from updating while `flag` is true (edit, profile and agent screens). */
export function useDirty(flag: boolean) {
  useEffect(() => (flag ? markDirty() : undefined), [flag]);
}
