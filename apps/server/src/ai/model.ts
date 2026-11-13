import type { LanguageModel } from 'ai';
import type { AiSettings } from './settings.js';

/** A model object (never a gateway id string), so operations can read provider and modelId. */
export type AiModel = Exclude<LanguageModel, string>;

/**
 * The language model for the settings, or null in manual mode. Only the chosen provider's
 * package is loaded. Call once and keep the result: settings change only on restart in MVP.
 */
export async function createModel(
  settings: AiSettings | null,
): Promise<AiModel | null> {
  if (!settings) return null;
  const { provider, model, apiKey } = settings;
  const baseURL = settings.baseUrl;
  switch (provider) {
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      return createGoogleGenerativeAI({ apiKey, baseURL })(model);
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai');
      return createOpenAI({ apiKey, baseURL })(model);
    }
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      return createAnthropic({ apiKey, baseURL })(model);
    }
    case 'openrouter':
    case 'openai-compatible': {
      const { createOpenAICompatible } =
        await import('@ai-sdk/openai-compatible');
      return createOpenAICompatible({
        name: provider,
        baseURL: baseURL ?? 'https://openrouter.ai/api/v1',
        apiKey,
        // Send the JSON schema (response_format json_schema); OpenRouter, Ollama and LM Studio accept it.
        supportsStructuredOutputs: true,
      })(model);
    }
  }
}
