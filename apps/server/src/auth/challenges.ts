import { randomBytes } from 'node:crypto';

export const CHALLENGE_TTL = 5 * 60 * 1000;
export const MAX_CHALLENGES = 10_000;

/**
 * One-time WebAuthn challenges by a random id, with what the options step decided (ADR-0003).
 * shortcut: lost on restart and not shared between processes; fine for the one-process container,
 * move to a table if we ever run several. Capped at MAX_CHALLENGES (oldest dropped), since
 * sign-in options are anonymous and could otherwise be spammed to fill memory.
 */
export function challengeStore<T>() {
  const entries = new Map<string, { expiresAt: number; value: T }>();
  return {
    put(value: T) {
      const now = Date.now();
      // Insertion order is expiry order (one TTL for all), so expired entries sit at the front.
      for (const [id, entry] of entries) {
        if (entry.expiresAt > now && entries.size < MAX_CHALLENGES) break;
        entries.delete(id);
      }
      const id = randomBytes(16).toString('base64url');
      entries.set(id, { expiresAt: now + CHALLENGE_TTL, value });
      return id;
    },
    /** The value once; undefined for an unknown, used or expired id. */
    take(id: string) {
      const entry = entries.get(id);
      entries.delete(id);
      return entry && entry.expiresAt > Date.now() ? entry.value : undefined;
    },
  };
}
