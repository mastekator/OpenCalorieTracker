import type { Database } from 'better-sqlite3';
import type { Config } from '../config.js';
import type { Secrets } from '../secrets.js';

export const aiProviders = [
  'google',
  'openai',
  'anthropic',
  'openrouter',
  'openai-compatible',
  'chatgpt',
] as const;
export type AiProvider = (typeof aiProviders)[number];

export interface AiSettings {
  provider: AiProvider;
  model: string;
  apiKey: string | undefined;
  baseUrl: string | undefined;
  source: 'env' | 'admin';
}

/** Encryption purpose of ai_settings.api_key_enc (ADR-0018 §1). */
export const API_KEY_PURPOSE = 'ai_settings.api_key';

/** The admin's saved row (ADR-0018 §2); keyUnreadable when its key does not decrypt (E-2). */
export function savedAiRow(db: Database, secrets: Secrets) {
  const row = db
    .prepare(
      'SELECT provider, model, base_url, api_key_enc, api_key_last4, rev FROM ai_settings',
    )
    .get() as
    | {
        provider: AiProvider;
        model: string;
        base_url: string | null;
        api_key_enc: string | null;
        api_key_last4: string | null;
        rev: number;
      }
    | undefined;
  if (!row) return null;
  const apiKey =
    row.api_key_enc === null
      ? undefined
      : (secrets.open(row.api_key_enc, API_KEY_PURPOSE) ?? null);
  return {
    provider: row.provider,
    model: row.model,
    baseUrl: row.base_url ?? undefined,
    apiKey: apiKey ?? undefined,
    keyLast4: row.api_key_last4,
    rev: row.rev,
    keyUnreadable: apiKey === null,
  };
}

/**
 * The single place that knows where AI settings come from (ADR-0005, ADR-0018 §2): AI_* in env
 * win whole; otherwise the admin's saved row; null means manual mode. Without db only env is read.
 */
export function getAiSettings(
  config: Config,
  db?: Database,
  secrets?: Secrets,
): AiSettings | null {
  const { provider, model, apiKey, baseUrl } = config.ai;
  if (!provider) {
    const saved = db && secrets ? savedAiRow(db, secrets) : null;
    if (!saved) return null;
    if (saved.keyUnreadable) {
      console.error(
        '[setup] The saved AI provider key cannot be decrypted (secret.key changed?); AI is off until the admin enters it again.',
      );
      return null;
    }
    return {
      provider: saved.provider,
      model: saved.model,
      apiKey: saved.apiKey,
      baseUrl: saved.baseUrl,
      source: 'admin',
    };
  }
  // A half-configured provider keeps the app running in manual mode.
  if (!model) {
    console.error('[setup] AI_PROVIDER is set but AI_MODEL is not; AI is off.');
    return null;
  }
  if (provider === 'openai-compatible' && !baseUrl) {
    console.error(
      '[setup] AI_PROVIDER=openai-compatible needs AI_BASE_URL; AI is off.',
    );
    return null;
  }
  return { provider, model, apiKey, baseUrl, source: 'env' };
}

/** host:port of the base URL only: no path, query or user:pass@ (ADR-0013). */
export function baseUrlHost(settings: { baseUrl?: string } | null) {
  return settings?.baseUrl ? (URL.parse(settings.baseUrl)?.host ?? null) : null;
}

/** Refinements per meal per edit session (ADR-0020 §6); null means no limit. */
export function refineLimit(db: Database) {
  const row = db
    .prepare('SELECT refine_per_session AS n FROM ai_limits')
    .get() as { n: number | null } | undefined;
  return row?.n ?? null;
}

/** Whether users may use their own AI key; ALLOW_USER_AI_KEYS wins over the admin's switch (ADR-0031 §2). */
export function userKeysAllowed(db: Database, config: Pick<Config, 'ai'>) {
  return (
    config.ai.userKeys ??
    db.prepare('SELECT allow_user_keys FROM instance_ai').pluck().get() !== 0
  );
}

/** The admin turned own keys off and deleted this user's key, and the user has not opened AI settings since. */
export function userKeysDisabledNotice(
  db: Database,
  config: Pick<Config, 'ai'>,
  userId: number,
) {
  return (
    !userKeysAllowed(db, config) &&
    db
      .prepare('SELECT ai_notice_seen FROM users WHERE id = ?')
      .pluck()
      .get(userId) === 0
  );
}
