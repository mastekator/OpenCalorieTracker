import Database from 'better-sqlite3';

/** One connection per process (ADR-0002). WAL lets the admin CLI write while the server runs. */
export function openDb(file: string) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  return db;
}
