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
    privacyUrl: 'https://openai.com/enterprise-privacy/',
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
  source: z.literal('env').nullable(),
  state: aiProviderStateSchema,
  checkedAt: z.number().nullable(),
  /** Provider's status code and message with secrets cut out, up to 500 chars. */
  details: z
    .object({ status: z.number().optional(), message: z.string().optional() })
    .optional(),
});
export type AdminAiStatus = z.infer<typeof adminAiStatusSchema>;
