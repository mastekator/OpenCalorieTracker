import { chmodSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ConfigResponse } from '@oct/shared';
import { dataDirWritable, loadConfig } from './config.js';
import { createApp } from './app.js';
import { migrate } from './db/migrate.js';
import { parseIds } from './privileges.js';
import { testApp } from './test/app.js';

const setupError = async (env: Record<string, string | undefined>) => {
  const res = await testApp(env).app.request('/api/config');
  expect(res.status).toBe(200);
  return ((await res.json()) as { setupError: string | null }).setupError;
};

describe('loadConfig', () => {
  it('applies defaults and treats empty values as unset', () => {
    const config = loadConfig({
      PUBLIC_URL: 'https://food.example.com/',
      ADMIN_PASSWORD: '',
    });
    expect(config).toMatchObject({
      publicUrl: 'https://food.example.com',
      authMethods: ['password', 'passkey'],
      registration: 'invite',
      adminPassword: undefined,
      trustProxyHops: 1,
      dataDir: './data',
      port: 3000,
    });
  });

  it('parses AUTH_METHODS', () => {
    expect(loadConfig({ AUTH_METHODS: ' passkey ' }).authMethods).toEqual([
      'passkey',
    ]);
  });

  it.each([
    ['', undefined],
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('parses ALLOW_OUTBOUND_REQUESTS=%j', (value, outbound) => {
    expect(loadConfig({ ALLOW_OUTBOUND_REQUESTS: value }).outbound).toBe(
      outbound,
    );
  });

  it.each([
    { REGISTRATION: 'foo' },
    { AUTH_METHODS: 'x' },
    { PORT: 'abc' },
    { ALLOW_OUTBOUND_REQUESTS: 'yes' },
  ])('rejects nonsense %o', (env) => {
    expect(() => loadConfig(env)).toThrow(/Invalid environment/);
  });
});

describe('setupError (AC-7.1, AC-1.3)', () => {
  it('is null for a valid setup', async () => {
    expect(await setupError({})).toBeNull();
  });

  it.each([
    undefined,
    '',
    'not a url',
    'http://food.example.com',
    'http://192.168.1.10:3000',
    'https://food.example.com/app',
    'https://food.example.com/?x=1',
    'ftp://localhost',
  ])('reports public_url_invalid for PUBLIC_URL=%s', async (url) => {
    expect(await setupError({ PUBLIC_URL: url })).toBe('public_url_invalid');
  });

  it('accepts http only on localhost', async () => {
    expect(
      await setupError({ PUBLIC_URL: 'http://localhost:8080' }),
    ).toBeNull();
  });

  it('reports admin_missing only for ADMIN_PASSWORD without ADMIN_EMAIL', async () => {
    expect(await setupError({ ADMIN_EMAIL: undefined })).toBe('admin_missing');
    expect(
      await setupError({ ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined }),
    ).toBeNull();
  });

  it('reports admin_password_missing when password sign-in is on', async () => {
    expect(await setupError({ ADMIN_PASSWORD: undefined })).toBe(
      'admin_password_missing',
    );
    expect(
      await setupError({ ADMIN_PASSWORD: undefined, AUTH_METHODS: 'passkey' }),
    ).toBeNull();
  });

  it('ignores the env admin once users exist', async () => {
    const { app, db } = testApp({ ADMIN_EMAIL: undefined });
    db.prepare(
      "INSERT INTO users (email, role, webauthn_user_id, created_at) VALUES ('a@b.c', 'admin', x'01', 0)",
    ).run();
    const body = (await (await app.request('/api/config')).json()) as {
      setupError: string | null;
    };
    expect(body.setupError).toBeNull();
  });
});

describe('setupRequired (ADR-0021 §1, §6, §9)', () => {
  const wizardEnv = { ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined };
  const required = async (app: {
    request: (p: string) => Promise<Response> | Response;
  }) =>
    ((await (await app.request('/api/config')).json()) as ConfigResponse)
      .setupRequired;

  it('is true on a healthy empty install without ADMIN_*', async () => {
    expect(await required(testApp(wizardEnv).app)).toBe(true);
  });

  it.each([
    ['a setup error', { ...wizardEnv, PUBLIC_URL: undefined }],
    ['ADMIN_PASSWORD without ADMIN_EMAIL', { ADMIN_EMAIL: undefined }],
    ['a config install', {}],
    ['an invalid config install', { ADMIN_EMAIL: 'nope' }],
  ])('is false with %s', async (_, env) => {
    expect(await required(testApp(env).app)).toBe(false);
  });

  it('is false with an unwritable data dir', async () => {
    const t = testApp(wizardEnv);
    t.config.dataDirWritable = false;
    expect(await required(createApp(t))).toBe(false);
  });

  it('is false once users exist, also on a v0.1.0 database', async () => {
    const t = testApp(wizardEnv);
    // A v0.1.0 database: an admin, migrations up to 0010, no setup_code table.
    t.db
      .prepare(
        "INSERT INTO users (email, role, webauthn_user_id, created_at) VALUES ('a@b.c', 'admin', x'01', 0)",
      )
      .run();
    t.db.exec(
      'DROP TABLE setup_code; DROP TABLE ai_test_runs; DROP TABLE ai_limits; ' +
        'DROP TABLE recipe_tombstones; DROP TABLE recipe_steps; DROP TABLE recipe_ingredients; DROP TABLE recipes; ' +
        'DROP TABLE edible_prefs; DROP TABLE product_prefs; DROP TABLE user_products; DROP TABLE food_products; DROP TABLE integration_settings; ALTER TABLE users DROP COLUMN off_enabled; ALTER TABLE users DROP COLUMN off_hint_at; ALTER TABLE meals DROP COLUMN edit_rev; DROP INDEX meals_import; ALTER TABLE meals DROP COLUMN import_id; DROP TABLE imports',
    );
    t.db.pragma('user_version = 10');
    migrate(t.db);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM setup_code').get()).toEqual({
      n: 0,
    });
    expect(await required(t.app)).toBe(false);
  });
});

describe('data dir (ADR-0017)', () => {
  it('is writable when it can be created, and leaves no probe behind', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'oct-')), 'data');
    expect(dataDirWritable(dir)).toBe(true);
    expect(readdirSync(dir)).toEqual([]);
  });

  it.skipIf(process.getuid?.() === 0)('reports a read-only folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oct-'));
    chmodSync(dir, 0o555);
    expect(dataDirWritable(dir)).toBe(false);
    expect(dataDirWritable(join(dir, 'data'))).toBe(false);
  });

  it('names the problem first in /api/config, without the path or ids', async () => {
    const t = testApp({ DATA_DIR: '/srv/secret-dir' });
    t.config.dataDirWritable = false;
    const res = await createApp(t).request('/api/config');
    const body = await res.text();
    expect(JSON.parse(body).setupError).toBe('data_dir_not_writable');
    expect(body).not.toContain('secret-dir');
  });
});

describe('parseIds', () => {
  it('defaults to 1000:1000, also for empty values', () => {
    expect(parseIds({})).toEqual({ uid: 1000, gid: 1000 });
    expect(parseIds({ PUID: '', PGID: '' })).toEqual({ uid: 1000, gid: 1000 });
  });

  it('takes the NAS user', () => {
    expect(parseIds({ PUID: '1026', PGID: '100' })).toEqual({
      uid: 1026,
      gid: 100,
    });
  });

  it.each(['0', '-1', 'abc', '10.5', ' 1026', '0x10'])(
    'refuses %j, so the app never runs as root',
    (v) => {
      expect(() => parseIds({ PUID: v })).toThrow(/PUID/);
      expect(() => parseIds({ PGID: v })).toThrow(/PGID/);
    },
  );
});
