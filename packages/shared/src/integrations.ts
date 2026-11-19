import { z } from 'zod';

/** GET /admin/integrations (ADR-0034 §5). */
export const adminIntegrationsSchema = z.object({
  /** Requests to outside services are allowed. */
  outbound: z.boolean(),
  /** ALLOW_OUTBOUND_REQUESTS is set: the switch is read-only, PUT answers 409. */
  outboundFromEnv: z.boolean(),
});
export type AdminIntegrations = z.infer<typeof adminIntegrationsSchema>;

export const adminIntegrationsRequestSchema = z.object({
  outbound: z.boolean(),
});
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
});
export type Integrations = z.infer<typeof integrationsSchema>;
