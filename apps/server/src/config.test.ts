import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
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

  it.each([{ REGISTRATION: 'foo' }, { AUTH_METHODS: 'x' }, { PORT: 'abc' }])(
    'rejects nonsense %o',
    (env) => {
      expect(() => loadConfig(env)).toThrow(/Invalid environment/);
    },
  );
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

  it('reports admin_missing on an empty database without ADMIN_EMAIL', async () => {
    expect(await setupError({ ADMIN_EMAIL: undefined })).toBe('admin_missing');
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
