import { readdirSync, readFileSync } from 'node:fs';
import type { Database } from 'better-sqlite3';

const dir = new URL('./migrations/', import.meta.url);

/**
 * Applies forward-only `NNNN_name.sql` files newer than `PRAGMA user_version`, one transaction each.
 * Foreign keys are off while migrating so a table rebuild (DROP + RENAME) does not cascade-delete
 * child rows; `foreign_key_check` must come back empty before each commit (SQLite "ALTER TABLE" §7).
 */
export function migrate(db: Database) {
  const current = db.pragma('user_version', { simple: true }) as number;
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_\w+\.sql$/.test(f))
    .sort();
  const fk = db.pragma('foreign_keys', { simple: true }) as number;
  // Has no effect inside a transaction, so it is set around them.
  db.pragma('foreign_keys = OFF');
  try {
    for (const file of files) {
      const version = Number(file.slice(0, 4));
      if (version <= current) continue;
      const sql = readFileSync(new URL(file, dir), 'utf8');
      db.transaction(() => {
        db.exec(sql);
        if ((db.pragma('foreign_key_check') as unknown[]).length)
          throw new Error(`migration ${file} breaks foreign keys`);
        db.pragma(`user_version = ${version}`);
      })();
    }
  } finally {
    db.pragma(`foreign_keys = ${fk}`);
  }
}
