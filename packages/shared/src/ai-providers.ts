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
  /** Refinements per meal per edit session; null without a limit. Set even with AI_* in env. */
  refineLimit: z.number().int().nullable(),
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

const aiDraftFields = {
  provider: z.enum(
    Object.keys(AI_PROVIDERS) as [AiProviderId, ...AiProviderId[]],
  ),
  model: z.string().trim().min(1).max(200),
  /** Left out for openai-compatible: the saved address is kept if the provider stays the same. */
  baseUrl: z
    .url({ protocol: /^https?$/ })
    .max(500)
    .optional(),
  /** Left out: the saved key is kept if the provider stays the same. */
  apiKey: z.string().trim().min(1).max(1000).optional(),
};

/** PUT /api/admin/ai/refine-limit body (ADR-0020 §6): null removes the limit. */
export const refineLimitRequestSchema = z.object({
  limit: z.number().int().min(1).max(50).nullable(),
});
export type RefineLimitRequest = z.infer<typeof refineLimitRequestSchema>;

/** POST /api/admin/ai/check body: settings checked without saving (ADR-0018 §4). */
export const aiDraftSchema = z.object(aiDraftFields);
export type AiDraft = z.infer<typeof aiDraftSchema>;

/** PUT /api/admin/ai/settings body (ADR-0018 §5). */
export const saveAiSettingsRequestSchema = z.object({
  ...aiDraftFields,
  /** Save without the check; the state is then unknown. */
  force: z.boolean().optional(),
  /** rev from GET /api/admin/ai; null when nothing is saved yet. */
  rev: z.number().int().nullable(),
});
export type SaveAiSettingsRequest = z.infer<typeof saveAiSettingsRequestSchema>;

/** POST /api/admin/ai/models body: without apiKey the saved key of the same provider (ADR-0018 §4). */
export const aiModelsRequestSchema = z.object({
  provider: aiDraftFields.provider,
  baseUrl: aiDraftFields.baseUrl,
  apiKey: aiDraftFields.apiKey,
});
export type AiModelsRequest = z.infer<typeof aiModelsRequestSchema>;

/** One model of the provider's list; vision null when the provider does not say. */
export const aiModelInfoSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  vision: z.boolean().nullable(),
  /** USD per 1M tokens; OpenRouter only. */
  price: z
    .object({ inputPerMTok: z.number(), outputPerMTok: z.number() })
    .optional(),
});
export type AiModelInfo = z.infer<typeof aiModelInfoSchema>;

/** POST /api/admin/ai/models response; a failure is 502 ai_models_failed with { state, details }. */
export const aiModelsResponseSchema = z.object({
  models: z.array(aiModelInfoSchema),
});
export type AiModelsResponse = z.infer<typeof aiModelsResponseSchema>;

/** Result of a draft check; also the details of 422 ai_check_failed. */
export const aiCheckResultSchema = adminAiStatusSchema.pick({
  state: true,
  checkedAt: true,
  details: true,
});
export type AiCheckResult = z.infer<typeof aiCheckResultSchema>;

/** POST /api/admin/ai/tests body: the form's draft, as for a check (ADR-0019 §3). */
export const aiTestStartRequestSchema = aiDraftSchema;

export const aiTestStatusSchema = z.enum([
  'running',
  'done',
  'stopped',
  'interrupted',
]);
export type AiTestStatus = z.infer<typeof aiTestStatusSchema>;

/** Why a run stopped before its last photo: a provider error that fails every photo, or the admin. */
export const aiTestStopReasonSchema = z.enum([
  'auth_error',
  'model_not_found',
  'quota_exceeded',
  'user',
]);
export type AiTestStopReason = z.infer<typeof aiTestStopReasonSchema>;

/** One test photo; result is 'ok', the miss, `error <code>`, 'pending' while running or 'not_run'. */
export const aiTestPhotoSchema = z.object({
  file: z.string(),
  expected: z.string(),
  got: z.string().optional(),
  kcal: z.number().optional(),
  levels: z.string().optional(),
  /** Questions the model asked about the dishes. */
  questions: z.number().optional(),
  ms: z.number().optional(),
  result: z.string(),
});
export type AiTestPhoto = z.infer<typeof aiTestPhotoSchema>;

/** One row of GET /api/admin/ai/tests, newest first; never a key or an address. */
export const aiTestRunSummarySchema = z.object({
  id: z.number(),
  provider: aiDraftFields.provider,
  model: z.string(),
  status: aiTestStatusSchema,
  stopReason: aiTestStopReasonSchema.nullable(),
  appVersion: z.string(),
  promptVersion: z.number(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  /** OpenRouter only: its price times the tokens. */
  costUsd: z.number().nullable(),
  passed: z.number(),
  total: z.number(),
  /** Average over the photos that got an answer or an error. */
  msPerPhoto: z.number().nullable(),
});
export type AiTestRunSummary = z.infer<typeof aiTestRunSummarySchema>;

/** GET /api/admin/ai/tests/:id; modelsMdRow and report only when done (ADR-0019 §5). */
export const aiTestRunSchema = aiTestRunSummarySchema.extend({
  photos: z.array(aiTestPhotoSchema),
  modelsMdRow: z.string().optional(),
  report: z.string().optional(),
});
export type AiTestRun = z.infer<typeof aiTestRunSchema>;
