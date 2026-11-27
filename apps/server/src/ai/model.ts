import type { LanguageModel } from 'ai';
import type { ChatgptAuth } from './chatgpt.js';
import type { AiSettings } from './settings.js';

/** A model object (never a gateway id string), so operations can read provider and modelId. */
export type AiModel = Exclude<LanguageModel, string>;

/**
 * The language model for the settings, or null in manual mode. Only the chosen provider's
 * package is loaded. The AI runtime keeps the result until the settings change.
 */
export async function createModel(
  settings: Omit<AiSettings, 'source'> | null,
  /** Every provider request goes through it; the SSRF guard of users' own addresses (ADR-0031 §2). */
  fetch?: typeof globalThis.fetch,
  /** The admin's ChatGPT sign-in; the chatgpt provider has no model without it. */
  chatgpt?: Pick<ChatgptAuth, 'accessToken'>,
): Promise<AiModel | null> {
  if (!settings) return null;
  const { provider, model, apiKey } = settings;
  const baseURL = settings.baseUrl;
  switch (provider) {
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      return createGoogleGenerativeAI({ apiKey, baseURL, fetch })(model);
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai');
      return createOpenAI({ apiKey, baseURL, fetch })(model);
    }
    case 'chatgpt': {
      if (!chatgpt) return null;
      const [
        { createOpenAI },
        { wrapLanguageModel },
        { CHATGPT_BASE_URL, chatgptMiddleware },
      ] = await Promise.all([
        import('@ai-sdk/openai'),
        import('ai'),
        import('./responses.js'),
      ]);
      const base = fetch ?? globalThis.fetch;
      return wrapLanguageModel({
        model: createOpenAI({
          baseURL: CHATGPT_BASE_URL,
          // The SDK insists on a key; fetch below replaces its header with the access token.
          apiKey: 'chatgpt-sign-in',
          // The token is read per request: it is refreshed under the model's feet.
          fetch: async (url, init) => {
            const headers = new Headers(init?.headers);
            headers.set(
              'authorization',
              `Bearer ${await chatgpt.accessToken()}`,
            );
            return base(url, { ...init, headers });
          },
        }).responses(model),
        middleware: chatgptMiddleware,
      });
    }
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      return createAnthropic({ apiKey, baseURL, fetch })(model);
    }
    case 'openrouter':
    case 'openai-compatible': {
      const { createOpenAICompatible } =
        await import('@ai-sdk/openai-compatible');
      return createOpenAICompatible({
        name: provider,
        baseURL: baseURL ?? 'https://openrouter.ai/api/v1',
        apiKey,
        fetch,
        // Send the JSON schema (response_format json_schema); OpenRouter, Ollama and LM Studio accept it.
        supportsStructuredOutputs: true,
      })(model);
    }
  }
}
