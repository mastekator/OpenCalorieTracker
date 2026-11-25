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
