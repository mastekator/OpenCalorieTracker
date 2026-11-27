import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { secretsFrom, type Secrets } from '../secrets.js';
import { aiSetup, mockModel } from '../test/ai.js';
import { testApp } from '../test/app.js';
import {
  API_KEY_PURPOSE,
  applyUserKeysEnv,
  getAiSettings,
} from './settings.js';

const KEY = 'sk-saved-key-abcd';
const ENV = { AI_PROVIDER: 'google', AI_MODEL: 'gemini-env', AI_API_KEY: 'k' };

/** The admin's row as the settings API (OCT-252) will write it. */
const saveRow = (db: ReturnType<typeof testApp>['db'], secrets: Secrets) =>
  db
    .prepare(
      `INSERT INTO ai_settings (id, provider, model, api_key_enc, api_key_last4, rev, updated_at)
       VALUES (1, 'openai', 'gpt-saved', ?, 'abcd', 3, 0)`,
    )
    .run(secrets.seal(KEY, API_KEY_PURPOSE));

afterEach(() => vi.restoreAllMocks());

describe('getAiSettings (ADR-0018 §2)', () => {
  it('is the saved row with its decrypted key when env has no AI_*', () => {
    const t = testApp();
    expect(getAiSettings(t.config, t.db, t.secrets)).toBeNull();
    saveRow(t.db, t.secrets);
    expect(getAiSettings(t.config, t.db, t.secrets)).toEqual({
      provider: 'openai',
      model: 'gpt-saved',
      apiKey: KEY,
      baseUrl: undefined,
      source: 'admin',
    });
    // Only the sealed form is stored.
    const stored = t.db
      .prepare('SELECT api_key_enc FROM ai_settings')
      .pluck()
      .get() as string;
    expect(stored).toMatch(/^v1\./);
    expect(
      JSON.stringify(t.db.prepare('SELECT * FROM ai_settings').all()),
    ).not.toContain(KEY);
  });

  it('E-1: AI_* win whole over a saved row', () => {
    const t = testApp(ENV);
    saveRow(t.db, t.secrets);
    expect(getAiSettings(t.config, t.db, t.secrets)).toMatchObject({
      provider: 'google',
      model: 'gemini-env',
      apiKey: 'k',
      source: 'env',
    });
  });

  it('E-2: a key sealed with another secret.key is manual mode, with a [setup] line', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = testApp();
    saveRow(t.db, secretsFrom(randomBytes(32)));
    expect(getAiSettings(t.config, t.db, t.secrets)).toBeNull();
    expect(error.mock.calls.map((c) => String(c[0]))).toContainEqual(
      expect.stringMatching(/^\[setup\] The saved AI provider key/),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain(KEY);
  });
});

describe('GET /api/admin/ai with a saved row', () => {
  it('E-1: env is active, the saved row is inactive', async () => {
    const t = await aiSetup(mockModel(), ENV);
    saveRow(t.db, t.secrets);
    const body = await (
      await t.app.request('/api/admin/ai', { headers: { cookie: t.cookie } })
    ).json();
    expect(body).toMatchObject({
      provider: 'google',
      model: 'gemini-env',
      source: 'env',
      keyLast4: null,
      keyUnreadable: false,
      savedInactive: true,
      rev: 3,
    });
    await t.cleanup();
  });

  it('E-2: an unreadable key shows the saved provider, no source, keyUnreadable', async () => {
    const t = await aiSetup(null);
    saveRow(t.db, secretsFrom(randomBytes(32)));
    const text = await (
      await t.app.request('/api/admin/ai', { headers: { cookie: t.cookie } })
    ).text();
    expect(JSON.parse(text)).toMatchObject({
      provider: 'openai',
      providerName: 'OpenAI',
      model: 'gpt-saved',
      keySet: false,
      source: null,
      keyLast4: 'abcd',
      keyUnreadable: true,
      savedInactive: false,
      rev: 3,
      state: 'not_configured',
    });
    expect(text).not.toContain(KEY);
    expect(await t.status()).toMatchObject({ recognition: 'not_configured' });
    await t.cleanup();
  });

  it('shows the admin source and keyLast4 for an active saved row, never the key', async () => {
    const t = await aiSetup(null);
    saveRow(t.db, t.secrets);
    await t.ai.apply(getAiSettings(t.config, t.db, t.secrets));
    const text = await (
      await t.app.request('/api/admin/ai', { headers: { cookie: t.cookie } })
    ).text();
    expect(JSON.parse(text)).toMatchObject({
      provider: 'openai',
      model: 'gpt-saved',
      keySet: true,
      source: 'admin',
      keyLast4: 'abcd',
      savedInactive: false,
      state: 'unknown',
    });
    expect(text).not.toContain(KEY);
    await t.cleanup();
  });
});

describe('applyUserKeysEnv (ADR-0031 §2)', () => {
  const withKey = (env: Record<string, string>) => {
    const t = testApp(env);
    t.db
      .prepare(
        "INSERT INTO users (email, name, role, webauthn_user_id, ai_notice_seen, created_at) VALUES ('b@example.com', 'B', 'user', randomblob(16), 1, 0)",
      )
      .run();
    t.db
      .prepare(
        "INSERT INTO user_ai_settings (user_id, provider, model, updated_at) SELECT id, 'openai', 'gpt-x', 0 FROM users",
      )
      .run();
    return t;
  };
  const state = (t: ReturnType<typeof testApp>) => ({
    keys: t.db.prepare('SELECT COUNT(*) FROM user_ai_settings').pluck().get(),
    notice: t.db
      .prepare("SELECT ai_notice_seen FROM users WHERE email = 'b@example.com'")
      .pluck()
      .get(),
  });

  it('deletes saved keys and re-arms the notice when ALLOW_USER_AI_KEYS=false', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const t = withKey({ ALLOW_USER_AI_KEYS: 'false' });
    applyUserKeysEnv(t.db, t.config);
    expect(state(t)).toEqual({ keys: 0, notice: 0 });
    expect(log).toHaveBeenCalledWith(
      '[info] 1 own AI keys deleted: ALLOW_USER_AI_KEYS=false',
    );
    applyUserKeysEnv(t.db, t.config);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { ALLOW_USER_AI_KEYS: 'true' }])(
    'keeps saved keys with %j',
    (env) => {
      const t = withKey(env);
      applyUserKeysEnv(t.db, t.config);
      expect(state(t)).toEqual({ keys: 1, notice: 1 });
    },
  );
});
