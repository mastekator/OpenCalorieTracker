import type { Config } from '../config.js';

export const aiProviders = [
  'google',
  'openai',
  'anthropic',
  'openrouter',
  'openai-compatible',
] as const;
export type AiProvider = (typeof aiProviders)[number];

export interface AiSettings {
  provider: AiProvider;
  model: string;
  apiKey: string | undefined;
  baseUrl: string | undefined;
  source: 'env';
}

/**
 * The single place that knows where AI settings come from (ADR-0005).
 * MVP has only the env source; null means manual mode.
 */
export function getAiSettings(config: Config): AiSettings | null {
  const { provider, model, apiKey, baseUrl } = config.ai;
  if (!provider) return null;
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
export function baseUrlHost(settings: AiSettings | null) {
  return settings?.baseUrl ? (URL.parse(settings.baseUrl)?.host ?? null) : null;
}
