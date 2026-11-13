import { describe, expect, it } from 'vitest';
import { migrate } from './migrate.js';
import { openDb } from './open.js';

const tables = (db: ReturnType<typeof openDb>) =>
  db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .pluck()
    .all();

describe('migrate', () => {
  it('brings an empty database to the latest version', () => {
    const db = openDb(':memory:');
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    expect(tables(db)).toEqual([
      'invites',
      'login_guards',
      'passkeys',
      'passwords',
      'profiles',
      'sessions',
      'users',
    ]);
  });

  it('does nothing when run again', () => {
    const db = openDb(':memory:');
    migrate(db);
    const before = db
      .prepare('SELECT sql FROM sqlite_master ORDER BY name')
      .pluck()
      .all();
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    expect(
      db.prepare('SELECT sql FROM sqlite_master ORDER BY name').pluck().all(),
    ).toEqual(before);
  });

  it('cascades user deletion', () => {
    const db = openDb(':memory:');
    migrate(db);
    db.prepare(
      "INSERT INTO users (id, email, role, webauthn_user_id, created_at) VALUES (1, 'a@b.c', 'user', x'01', 0)",
    ).run();
    db.prepare(
      "INSERT INTO passwords (user_id, hash, updated_at) VALUES (1, 'h', 0)",
    ).run();
    db.prepare('DELETE FROM users WHERE id = 1').run();
    expect(db.prepare('SELECT COUNT(*) FROM passwords').pluck().get()).toBe(0);
  });
});
