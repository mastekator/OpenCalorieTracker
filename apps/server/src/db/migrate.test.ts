import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readRecipe } from '../recipes/read.js';
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
    expect(db.pragma('user_version', { simple: true })).toBe(20);
    expect(tables(db)).toEqual([
      'agent_drafts',
      'agent_messages',
      'ai_limits',
      'ai_settings',
      'ai_test_runs',
      'food_products',
      'illustration_choices',
      'integration_settings',
      'invites',
      'login_guards',
      'meal_items',
      'meal_tombstones',
      'meals',
      'passkeys',
      'passwords',
      'profiles',
      'recipe_ingredients',
      'recipe_steps',
      'recipe_tombstones',
      'recipes',
      'sessions',
      'setup_code',
      'sqlite_sequence',
      'user_products',
      'users',
      'weighings',
    ]);
  });

  it('gives every migration its own number', () => {
    // migrate() skips a file whose number is <= user_version, so a duplicate is never applied
    // on a database that already took its twin. The 0005 pair predates any release.
    const numbers = readdirSync(new URL('./migrations/', import.meta.url))
      .filter((f) => /^\d{4}_\w+\.sql$/.test(f))
      .map((f) => f.slice(0, 4));
    expect(numbers.filter((n, i) => numbers.indexOf(n) !== i)).toEqual([
      '0005',
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
    expect(db.pragma('user_version', { simple: true })).toBe(20);
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
          'SELECT email, locale, sync_rev, photo_retention_days, off_enabled, off_hint_at FROM users',
        )
        .get(),
    ).toEqual({
      email: 'a@b.c',
      locale: 'ru',
      sync_rev: 7,
      photo_retention_days: 30,
      off_enabled: 0,
      off_hint_at: null,
    });
    expect(db.prepare('SELECT COUNT(*) FROM meals').pluck().get()).toBe(1);
    db.prepare('UPDATE users SET photo_retention_days = NULL').run();
    db.prepare('DELETE FROM users WHERE id = 1').run();
    expect(db.prepare('SELECT COUNT(*) FROM passwords').pluck().get()).toBe(0);
    expect(db.prepare('SELECT COUNT(*) FROM meals').pluck().get()).toBe(0);
  });

  it('keeps meals and their dishes when rebuilding meal_items in 0014 and 0018', () => {
    const db = openDb(':memory:');
    const dir = new URL('./migrations/', import.meta.url);
    // The database as version 13 left it.
    for (const f of readdirSync(dir)
      .filter((f) => /^\d{4}_\w+\.sql$/.test(f) && f < '0014')
      .sort())
      db.exec(readFileSync(new URL(f, dir), 'utf8'));
    db.pragma('user_version = 13');
    db.prepare(
      "INSERT INTO users (id, email, role, webauthn_user_id, created_at) VALUES (1, 'a@b.c', 'user', x'01', 0)",
    ).run();
    db.prepare(
      `INSERT INTO meals (id, user_id, client_id, eaten_at, tz_offset_min, local_date, meal_type, created_at, updated_at)
       VALUES (1, 1, 'c', 0, 0, '1970-01-01', 'lunch', 0, 0)`,
    ).run();
    const insert = db.prepare(
      `INSERT INTO meal_items (meal_id, position, name, name_key, grams, kcal, protein_g, fat_g,
         carbs_g, source, ai_provider, ai_model, confidence, illustration)
       VALUES (1, ?, ?, ?, 150, 210.5, 7.1, 3.2, 40.4, ?, ?, ?, ?, ?)`,
    );
    insert.run(0, 'Рис', 'рис', 'ai', 'openai', 'gpt', 0.8, 'rice');
    insert.run(1, 'Чай', 'чай', 'manual', null, null, null, null);
    const before = db.prepare('SELECT * FROM meal_items ORDER BY id').all();

    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(20);
    expect(db.prepare('SELECT * FROM meal_items ORDER BY id').all()).toEqual(
      before.map((r) => ({ ...(r as object), recipe_id: null, barcode: null })),
    );
    // The new source passes the CHECK and the link is cleared with its recipe.
    db.prepare(
      `INSERT INTO recipes (id, user_id, name, name_key, rev, created_at, updated_at)
       VALUES (1, 1, 'Плов', 'плов', 1, 0, 0)`,
    ).run();
    db.prepare(
      "UPDATE meal_items SET source = 'recipe', recipe_id = 1 WHERE name = 'Чай'",
    ).run();
    // 0018 adds the barcode sources.
    db.prepare(
      "UPDATE meal_items SET source = 'label' WHERE name = 'Рис'",
    ).run();
    expect(() =>
      db
        .prepare("UPDATE meal_items SET source = 'photo' WHERE name = 'Рис'")
        .run(),
    ).toThrow();
    db.prepare('DELETE FROM recipes').run();
    expect(
      db.prepare("SELECT recipe_id FROM meal_items WHERE name = 'Чай'").get(),
    ).toEqual({ recipe_id: null });
    db.prepare('DELETE FROM meals').run();
    expect(db.prepare('SELECT COUNT(*) FROM meal_items').pluck().get()).toBe(0);
  });

  it('reads recipes saved before 0019 as before, computed from ingredients', () => {
    const db = openDb(':memory:');
    const dir = new URL('./migrations/', import.meta.url);
    for (const f of readdirSync(dir)
      .filter((f) => /^\d{4}_\w+\.sql$/.test(f) && f < '0019')
      .sort())
      db.exec(readFileSync(new URL(f, dir), 'utf8'));
    db.pragma('user_version = 18');
    db.prepare(
      "INSERT INTO users (id, email, role, webauthn_user_id, created_at) VALUES (1, 'a@b.c', 'user', x'01', 0)",
    ).run();
    db.prepare(
      `INSERT INTO recipes (id, user_id, name, name_key, cooked_g, servings, rev, created_at, updated_at)
       VALUES (1, 1, 'Плов', 'плов', 900, 3, 1, 0, 0)`,
    ).run();
    db.prepare(
      `INSERT INTO recipe_ingredients (recipe_id, position, name, grams, kcal, protein_g, fat_g,
         carbs_g, source) VALUES (1, 0, 'Рис', 500, 1750, 35, 5, 390, 'manual')`,
    ).run();

    migrate(db);
    expect(readRecipe(db, 1)).toMatchObject({
      name: 'Плов',
      cookedG: 900,
      servings: 3,
      ingredients: [{ name: 'Рис', grams: 500, kcal: 1750 }],
      per100: null,
      servingG: null,
    });
  });

  it('makes products cached before 0020 stale so OFF is asked for the package weight', () => {
    const db = openDb(':memory:');
    const dir = new URL('./migrations/', import.meta.url);
    for (const f of readdirSync(dir)
      .filter((f) => /^\d{4}_\w+\.sql$/.test(f) && f < '0020')
      .sort())
      db.exec(readFileSync(new URL(f, dir), 'utf8'));
    db.pragma('user_version = 19');
    db.prepare(
      `INSERT INTO food_products (code, status, per, fetched_at)
       VALUES ('4000000000006', 'found', 'g', 123)`,
    ).run();

    migrate(db);
    expect(
      db.prepare('SELECT fetched_at, pack_g FROM food_products').get(),
    ).toEqual({
      fetched_at: 0,
      pack_g: null,
    });
  });

  it('turns foreign keys back on when a migration fails', () => {
    const db = openDb(':memory:');
    db.pragma('user_version = 4');
    // Tables 0005 rebuilds do not exist, so it throws.
    expect(() => migrate(db)).toThrow();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
