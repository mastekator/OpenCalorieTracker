import { z } from 'zod';

/** GET /admin/integrations (ADR-0034 §5). */
export const adminIntegrationsSchema = z.object({
  /** Requests to outside services are allowed. */
  outbound: z.boolean(),
  /** ALLOW_OUTBOUND_REQUESTS is set: the switch is read-only, PUT answers 409. */
  outboundFromEnv: z.boolean(),
  /** Personal API tokens work on /api/v1 and /mcp (ADR-0027 §6). */
  tokens: z.boolean(),
  /** ALLOW_API_TOKENS is set: the switch is read-only, PUT answers 409. */
  tokensFromEnv: z.boolean(),
});
export type AdminIntegrations = z.infer<typeof adminIntegrationsSchema>;

/** Either switch or both; a missing one stays as it is. */
export const adminIntegrationsRequestSchema = z
  .object({ outbound: z.boolean().optional(), tokens: z.boolean().optional() })
  .refine((b) => b.outbound !== undefined || b.tokens !== undefined);
export type AdminIntegrationsRequest = z.infer<
  typeof adminIntegrationsRequestSchema
>;

/** GET /integrations: what the signed-in user can use. */
export const integrationsSchema = z.object({
  barcode: z.object({
    /** The user's own switch (offEnabled). */
    enabled: z.boolean(),
    /** The admin forbade outbound requests; the user's switch is kept (E-6). */
    blocked: z.boolean(),
  }),
  /** The last finished export, for the hub card; null before the first one. */
  export: z.object({
    lastAt: z.iso.datetime().nullable(),
    lastFormat: z.enum(['json', 'csv']).nullable(),
  }),
  tokens: z.object({
    /** The user's tokens, expired ones included. */
    count: z.number().int(),
    /** The admin forbade tokens; they are kept but answer 403. */
    blocked: z.boolean(),
  }),
  webhooks: z.object({
    count: z.number().int(),
    /** How many of them are switched on. */
    enabled: z.number().int(),
    /** The first webhook switched off after failures or whose last event failed; null if none. */
    failing: z.string().nullable(),
    /** The admin forbade outbound requests; nothing is queued or sent. */
    blocked: z.boolean(),
  }),
  mcp: z.object({
    /** The user's own switch (mcpEnabled). */
    enabled: z.boolean(),
    /** The admin forbade tokens, so /mcp answers 403 too. */
    blocked: z.boolean(),
  }),
});
export type Integrations = z.infer<typeof integrationsSchema>;

/** At most this many tokens per user; the next POST answers 409 limit_reached (AC-5.5). */
export const MAX_API_TOKENS = 20;

export const apiTokenScopeSchema = z.enum(['read', 'write']);
export type ApiTokenScope = z.infer<typeof apiTokenScopeSchema>;

/** GET /tokens item (ADR-0027 §1); the token itself is never shown again. */
export const apiTokenSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  scope: apiTokenScopeSchema,
  createdAt: z.iso.datetime(),
  /** null: never expires. */
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
});
export type ApiToken = z.infer<typeof apiTokenSchema>;

export const createApiTokenRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scope: apiTokenScopeSchema,
  /** null: never expires. */
  expiresInDays: z.literal([30, 90, 365]).nullable().default(90),
});
export type CreateApiTokenRequest = z.input<typeof createApiTokenRequestSchema>;

/** POST /tokens: the only time the token is shown (AC-5.1). */
export const createdApiTokenSchema = apiTokenSchema.extend({
  token: z.string(),
});
export type CreatedApiToken = z.infer<typeof createdApiTokenSchema>;

/** At most this many webhooks per user; the next POST answers 409 limit_reached. */
export const MAX_WEBHOOKS = 10;
/** The delivery log keeps this many rows per webhook (ADR-0027 §3). */
export const MAX_WEBHOOK_DELIVERIES = 20;

export const webhookEventSchema = z.enum([
  'meal.saved',
  'day.closed',
  'day.empty',
]);
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const webhookFields = z.object({
  name: z.string().trim().min(1).max(60),
  url: z.url({ protocol: /^https?$/ }).max(2000),
  events: z
    .array(webhookEventSchema)
    .min(1)
    .refine((list) => new Set(list).size === list.length),
  dayClosedAt: hhmm,
  emptyBy: hhmm.nullable(),
  enabled: z.boolean(),
});
/** day.empty needs its «nothing logged by» time. */
export const webhookEmptyByOk = (w: {
  events: WebhookEvent[];
  emptyBy: string | null;
}) => !w.events.includes('day.empty') || w.emptyBy !== null;

export const createWebhookRequestSchema = webhookFields
  .extend({
    dayClosedAt: hhmm.default('23:59'),
    emptyBy: hhmm.nullable().default(null),
    enabled: z.boolean().default(true),
  })
  .refine(webhookEmptyByOk, { path: ['emptyBy'] });
export type CreateWebhookRequest = z.input<typeof createWebhookRequestSchema>;

/** Any subset; the server checks the merged webhook (emptyBy) and a new url again. */
export const updateWebhookRequestSchema = webhookFields.partial();
export type UpdateWebhookRequest = z.infer<typeof updateWebhookRequestSchema>;

/** GET /webhooks item; the secret is shown only on create and on a new secret. */
export const webhookSchema = webhookFields.extend({
  id: z.number().int(),
  /** 'failures': turned off after 20 failed deliveries in a row. */
  disabledReason: z.enum(['failures']).nullable(),
  failStreak: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type Webhook = z.infer<typeof webhookSchema>;

export const createdWebhookSchema = webhookSchema.extend({
  secret: z.string(),
});
export type CreatedWebhook = z.infer<typeof createdWebhookSchema>;

/** A delivery log row; `test` comes from «Send test». */
export const webhookDeliverySchema = z.object({
  id: z.number().int(),
  event: z.union([webhookEventSchema, z.literal('test')]),
  at: z.iso.datetime(),
  /** HTTP status; null: no response. */
  status: z.number().int().nullable(),
  /** timeout | refused | blocked_address | dns | network; null with any status. */
  error: z.string().nullable(),
  attempts: z.number().int(),
  durationMs: z.number().int().nullable(),
});
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;
