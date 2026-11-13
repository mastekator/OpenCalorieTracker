import { readdirSync, readFileSync } from 'node:fs';
import type { Database } from 'better-sqlite3';

const dir = new URL('./migrations/', import.meta.url);

/** Applies forward-only `NNNN_name.sql` files newer than `PRAGMA user_version`, one transaction each. */
export function migrate(db: Database) {
  const current = db.pragma('user_version', { simple: true }) as number;
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_\w+\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const version = Number(file.slice(0, 4));
    if (version <= current) continue;
    const sql = readFileSync(new URL(file, dir), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
  }
}
