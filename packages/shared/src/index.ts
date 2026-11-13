import { z } from 'zod';

/** Stable error codes in `{ error: { code } }` bodies; clients translate them (ADR-0001). */
export type ErrorCode =
  | 'validation_failed'
  | 'unauthenticated'
  | 'invalid_credentials'
  | 'forbidden'
  | 'not_found'
  | 'email_taken'
  | 'invite_used'
  | 'too_many_attempts'
  | 'device_blocked'
  | 'ip_blocked'
  | 'not_configured'
  | 'ai_not_configured'
  | 'ai_no_vision'
  | 'ai_quota_exceeded'
  | 'ai_unavailable'
  | 'ai_invalid_response'
  | 'internal';

export interface ErrorBody {
  error: { code: ErrorCode; details?: unknown };
}

export const authMethodSchema = z.enum(['password', 'passkey']);
export type AuthMethod = z.infer<typeof authMethodSchema>;

export const registrationSchema = z.enum(['invite', 'open']);
export type Registration = z.infer<typeof registrationSchema>;

/** Installation problems the owner must fix in the compose file; shown on the sign-in screen. */
export const setupErrorSchema = z.enum([
  'public_url_invalid',
  'admin_missing',
  'admin_password_missing',
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

export * from './units.js';
export * from './recognition.js';
export * from './norm/schemas.js';
export * from './norm/calculate.js';
