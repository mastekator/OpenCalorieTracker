import type { Database } from 'better-sqlite3';

/** The user's remembered edible percent per reference key (ADR-0039 §4); unknown keys are absent. */
export function readEdiblePrefs(
  db: Database,
  userId: number,
  keys: string[],
): Map<string, number> {
  if (!keys.length) return new Map();
  const rows = db
    .prepare(
      `SELECT key, pct FROM edible_prefs WHERE user_id = ? AND key IN (${keys.map(() => '?').join(', ')})`,
    )
    .all(userId, ...keys) as { key: string; pct: number }[];
  return new Map(rows.map((r) => [r.key, r.pct]));
}
