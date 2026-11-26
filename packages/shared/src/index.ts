import { z } from 'zod';
import { authMethodSchema } from './auth.js';

/** Raised only on a breaking API change; older web clients then get 409 client_outdated (ADR-0012). */
export const API_VERSION = 3;

/** Stable error codes in `{ error: { code } }` bodies; clients translate them (ADR-0001). */
export type ErrorCode =
  | 'validation_failed'
  | 'unauthenticated'
  | 'invalid_credentials'
  | 'method_disabled'
  | 'passkey_unknown'
  | 'passkey_failed'
  | 'last_sign_in_method'
  | 'password_invalid'
  | 'password_too_common'
  | 'forbidden'
  | 'not_found'
  | 'email_taken'
  | 'invite_used'
  | 'invite_invalid'
  | 'invite_expired'
  | 'registration_failed'
  | 'too_many_attempts'
  | 'refine_limit_reached'
  | 'device_blocked'
  | 'ip_blocked'
  | 'not_configured'
  | 'ai_not_configured'
  | 'ai_no_vision'
  | 'ai_quota_exceeded'
  | 'ai_unavailable'
  | 'ai_invalid_response'
  | 'ai_empty_result'
  | 'ai_env_managed'
  | 'outbound_env_managed'
  | 'tokens_env_managed'
  | 'integrations_disabled'
  | 'invalid_token'
  | 'insufficient_scope'
  | 'mcp_disabled'
  | 'period_too_long'
  | 'rate_limited'
  | 'limit_reached'
  | 'http_not_private'
  | 'outbound_disabled'
  | 'barcode_invalid'
  | 'ai_settings_changed'
  | 'ai_key_required'
  | 'ai_check_failed'
  | 'ai_models_failed'
  | 'ai_test_running'
  | 'photo_too_large'
  | 'photo_invalid'
  | 'client_outdated'
  | 'photo_expired'
  | 'payload_too_large'
  | 'export_too_large'
  | 'photo_in_use'
  | 'recipe_changed'
  | 'edit_conflict'
  | 'agent_not_ready'
  | 'agent_closed'
  | 'cannot_delete_self'
  | 'setup_code_invalid'
  | 'setup_code_expired'
  | 'setup_code_burned'
  | 'setup_done'
  | 'import_too_large'
  | 'already_imported'
  | 'export_version_unsupported'
  | 'internal';

export interface ErrorBody {
  error: { code: ErrorCode; details?: unknown };
}

export const registrationSchema = z.enum(['invite', 'open']);
export type Registration = z.infer<typeof registrationSchema>;

/** Installation problems the owner must fix in the compose file; shown on the sign-in screen. */
export const setupErrorSchema = z.enum([
  'data_dir_not_writable',
  'public_url_invalid',
  'admin_missing',
  'admin_email_invalid',
  'admin_password_missing',
  'admin_password_invalid',
]);
export type SetupError = z.infer<typeof setupErrorSchema>;

export const configResponseSchema = z.object({
  version: z.string(),
  apiVersion: z.number().int(),
  publicUrl: z.string().nullable(),
  authMethods: z.array(authMethodSchema),
  registration: registrationSchema,
  setupError: setupErrorSchema.nullable(),
  /** True only when the first-run wizard should create the admin (ADR-0021 §6). */
  setupRequired: z.boolean(),
});
export type ConfigResponse = z.infer<typeof configResponseSchema>;

export * from './auth.js';
export * from './units.js';
export * from './recognition.js';
export * from './refine.js';
export * from './ai-providers.js';
export * from './meals.js';
export * from './meals/content.js';
export * from './nutrition.js';
export * from './norm/schemas.js';
export * from './norm/calculate.js';
export * from './norm/interview.js';
export * from './dates.js';
export * from './diary/summarize.js';
export * from './locales.js';
export * from './settings.js';
export * from './integrations.js';
export * from './barcodes/barcodes.js';
export * from './barcodes/merge.js';
export * from './barcodes/amount.js';
export * from './illustrations/dictionary.js';
export * from './sync.js';
export * from './weight/schemas.js';
export * from './weight/trend.js';
export * from './weight/jump.js';
export * from './recipes/recipes.js';
export * from './recipes/lighter.js';
export * from './recipes/parse.js';
export * from './recipes/ingredients.js';
export * from './export/schema.js';
export * from './drinks/drinks.js';
export * from './edible/refuse.js';
export * from './imports/schema.js';
