import { z } from 'zod';
import { authMethodSchema } from './auth.js';

/** Raised only on a breaking API change; older web clients then get 409 client_outdated (ADR-0012). */
export const API_VERSION = 1;

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
  | 'device_blocked'
  | 'ip_blocked'
  | 'not_configured'
  | 'ai_not_configured'
  | 'ai_no_vision'
  | 'ai_quota_exceeded'
  | 'ai_unavailable'
  | 'ai_invalid_response'
  | 'photo_too_large'
  | 'photo_invalid'
  | 'client_outdated'
  | 'photo_expired'
  | 'payload_too_large'
  | 'photo_in_use'
  | 'internal';

export interface ErrorBody {
  error: { code: ErrorCode; details?: unknown };
}

export const registrationSchema = z.enum(['invite', 'open']);
export type Registration = z.infer<typeof registrationSchema>;

/** Installation problems the owner must fix in the compose file; shown on the sign-in screen. */
export const setupErrorSchema = z.enum([
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
});
export type ConfigResponse = z.infer<typeof configResponseSchema>;

export * from './auth.js';
export * from './units.js';
export * from './recognition.js';
export * from './ai-providers.js';
export * from './meals.js';
export * from './nutrition.js';
export * from './norm/schemas.js';
export * from './norm/calculate.js';
export * from './norm/interview.js';
export * from './dates.js';
export * from './diary/summarize.js';
export * from './locales.js';
export * from './settings.js';
