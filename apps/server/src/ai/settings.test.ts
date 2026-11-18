import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { secretsFrom, type Secrets } from '../secrets.js';
import { aiSetup, mockModel } from '../test/ai.js';
import { testApp } from '../test/app.js';
import { API_KEY_PURPOSE, getAiSettings } from './settings.js';

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
