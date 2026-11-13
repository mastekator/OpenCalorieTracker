import type { Database } from 'better-sqlite3';

/** Next value of the user's sync counter (ADR-0011 §3); call inside the change's transaction. */
export const bumpRev = (db: Database, userId: number) =>
  (
    db
      .prepare(
        'UPDATE users SET sync_rev = sync_rev + 1 WHERE id = ? RETURNING sync_rev',
      )
      .get(userId) as { sync_rev: number }
  ).sync_rev;
