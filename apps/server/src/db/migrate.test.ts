import { readdirSync, readFileSync } from 'node:fs';
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
    expect(db.pragma('user_version', { simple: true })).toBe(5);
    expect(tables(db)).toEqual([
      'agent_drafts',
      'agent_messages',
      'illustration_choices',
      'invites',
      'login_guards',
      'meal_items',
      'meals',
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
    expect(db.pragma('user_version', { simple: true })).toBe(5);
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

  it('keeps users and their data when rebuilding users in 0005', () => {
    const db = openDb(':memory:');
    // The database as version 4 left it.
    const dir = new URL('./migrations/', import.meta.url);
    for (const f of readdirSync(dir).sort().slice(0, 4))
      db.exec(readFileSync(new URL(f, dir), 'utf8'));
    db.pragma('user_version = 4');
    db.prepare(
      "INSERT INTO users (id, email, role, webauthn_user_id, created_at, locale, sync_rev) VALUES (1, 'a@b.c', 'user', x'01', 0, 'ru', 7)",
    ).run();
    db.prepare(
      "INSERT INTO passwords (user_id, hash, updated_at) VALUES (1, 'h', 0)",
    ).run();
    db.prepare(
      `INSERT INTO meals (user_id, client_id, eaten_at, tz_offset_min, local_date, meal_type, created_at, updated_at)
       VALUES (1, 'c', 0, 0, '1970-01-01', 'lunch', 0, 0)`,
    ).run();

    migrate(db);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(
      db
        .prepare(
          'SELECT email, locale, sync_rev, photo_retention_days FROM users',
        )
        .get(),
    ).toEqual({
      email: 'a@b.c',
      locale: 'ru',
      sync_rev: 7,
      photo_retention_days: 30,
    });
    expect(db.prepare('SELECT COUNT(*) FROM meals').pluck().get()).toBe(1);
    db.prepare('UPDATE users SET photo_retention_days = NULL').run();
    db.prepare('DELETE FROM users WHERE id = 1').run();
    expect(db.prepare('SELECT COUNT(*) FROM passwords').pluck().get()).toBe(0);
    expect(db.prepare('SELECT COUNT(*) FROM meals').pluck().get()).toBe(0);
  });

  it('turns foreign keys back on when a migration fails', () => {
    const db = openDb(':memory:');
    db.pragma('user_version = 4');
    // Tables 0005 rebuilds do not exist, so it throws.
    expect(() => migrate(db)).toThrow();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
