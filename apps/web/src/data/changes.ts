const listeners = new Set<() => void>();

/** Called after anything in a local database changed; hooks re-read on it. */
export function onChange(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export const emitChange = () => listeners.forEach((l) => l());
