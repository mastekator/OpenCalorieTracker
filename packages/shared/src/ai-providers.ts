import { z } from 'zod';

/**
 * Display name and data policy link of each AI provider (ADR-0013). An OpenAI-compatible
 * server has neither: the UI shows its host instead.
 */
export const AI_PROVIDERS = {
  google: {
    name: 'Google Gemini',
    privacyUrl: 'https://ai.google.dev/gemini-api/terms',
  },
  openai: {
    name: 'OpenAI',
    privacyUrl: 'https://platform.openai.com/docs/guides/your-data',
  },
  anthropic: {
    name: 'Anthropic',
    privacyUrl: 'https://www.anthropic.com/legal/privacy',
  },
  openrouter: {
    name: 'OpenRouter',
    privacyUrl: 'https://openrouter.ai/privacy',
  },
  'openai-compatible': { name: null, privacyUrl: null },
} as const;
export type AiProviderId = keyof typeof AI_PROVIDERS;

/** The provider's state by the last real request since start (ADR-0013). */
export const aiProviderStateSchema = z.enum([
  'ok',
  'not_configured',
  'auth_error',
  'quota_exceeded',
  'unavailable',
  'model_not_found',
  'timeout',
  'no_vision',
  'unknown',
]);
export type AiProviderState = z.infer<typeof aiProviderStateSchema>;

/** GET /api/admin/ai and POST /api/admin/ai/check. Never carries the key. */
export const adminAiStatusSchema = z.object({
  provider: z.string().nullable(),
  providerName: z.string().nullable(),
  model: z.string().nullable(),
  keySet: z.boolean(),
  /** host:port of AI_BASE_URL only, without path, query or credentials. */
  baseUrlHost: z.string().nullable(),
  /** Where the active settings come from; null in manual mode, also with an unreadable saved key. */
  source: z.enum(['env', 'admin']).nullable(),
  /** Last 4 characters of the admin's saved key; never the key itself. */
  keyLast4: z.string().nullable(),
  /** The saved key does not decrypt (another secret.key): manual mode until it is entered again. */
  keyUnreadable: z.boolean(),
  /** AI_* in env win while a saved row exists and is ignored. */
  savedInactive: z.boolean(),
  /** Version of the saved row for optimistic writes; null without one. */
  rev: z.number().nullable(),
  state: aiProviderStateSchema,
  checkedAt: z.number().nullable(),
  /** Provider's status code and message with secrets cut out, up to 500 chars; the timeout that ran out. */
  details: z
    .object({
      status: z.number().optional(),
      message: z.string().optional(),
      timeoutSec: z.number().optional(),
    })
    .optional(),
});
export type AdminAiStatus = z.infer<typeof adminAiStatusSchema>;
