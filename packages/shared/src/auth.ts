import { z } from 'zod';
import { localeSchema, themeSchema } from './settings.js';
import { unitsSchema } from './units.js';

export const authMethodSchema = z.enum(['password', 'passkey']);
export type AuthMethod = z.infer<typeof authMethodSchema>;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** AC-0.8 rules a password can break; the common-password list is checked on the server only. */
export type PasswordRule = 'length' | 'letter' | 'digit' | 'symbol' | 'email';

/** Rules the password breaks, in display order; empty means it passes. */
export function passwordProblems(
  password: string,
  email?: string,
): PasswordRule[] {
  const problems: PasswordRule[] = [];
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    problems.push('length');
  }
  if (!/\p{L}/u.test(password)) problems.push('letter');
  if (!/\p{Nd}/u.test(password)) problems.push('digit');
  if (!/[^\p{L}\p{Nd}]/u.test(password)) problems.push('symbol');
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) {
    problems.push('email');
  }
  return problems;
}

/** Logins are case- and edge-whitespace-insensitive (AC-0.3). */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

// Generous upper bound: the policy is enforced when a password is set, not when it is typed.
const passwordInput = z.string().min(1).max(1024);

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().max(320),
  password: passwordInput,
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** `currentPassword` is required when the user already has a password, absent when setting one. */
export const changePasswordRequestSchema = z.object({
  currentPassword: passwordInput.optional(),
  newPassword: passwordInput,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const meResponseSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  name: z.string().nullable(),
  role: z.enum(['admin', 'user']),
  locale: localeSchema,
  theme: themeSchema,
  units: unitsSchema,
  normDisclaimerHidden: z.boolean(),
  /** The admin still signs in with ADMIN_PASSWORD from the compose file (AC-1.7). */
  passwordFromConfig: z.boolean(),
  /** Sign-in methods the user has set up, whether or not they are enabled. */
  methods: z.array(authMethodSchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** Secret of an invite or recovery link, from the `#` part of the URL (32 random bytes, base64url). */
const tokenSchema = z.string().min(1).max(128);

export const linkKindSchema = z.enum(['invite', 'recovery']);
export type LinkKind = z.infer<typeof linkKindSchema>;

/** A revoked link reads as one that never existed (E-4.4). */
export const linkStatusSchema = z.enum(['valid', 'expired', 'used', 'invalid']);
export type LinkStatus = z.infer<typeof linkStatusSchema>;

export const inviteCheckRequestSchema = z.object({ token: tokenSchema });
export type InviteCheckRequest = z.infer<typeof inviteCheckRequestSchema>;

export const inviteCheckResponseSchema = z.object({
  /** Null for an invalid token. */
  kind: linkKindSchema.nullable(),
  /** Whose link it is; only for a valid one. */
  email: z.string().nullable(),
  status: linkStatusSchema,
});
export type InviteCheckResponse = z.infer<typeof inviteCheckResponseSchema>;

/** With a token the email comes from the invite; without one only under REGISTRATION=open. */
export const registerRequestSchema = z.object({
  token: tokenSchema.optional(),
  email: emailSchema.optional(),
  name: z.string().trim().max(100).optional(),
  password: passwordInput,
  /** The browser's language, so the new account starts in it (AC-3.7). */
  locale: localeSchema.optional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const recoverRequestSchema = z.object({
  token: tokenSchema,
  password: passwordInput,
});
export type RecoverRequest = z.infer<typeof recoverRequestSchema>;

export const createInviteRequestSchema = z.object({ email: emailSchema });
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

/** The only response that carries the full link; it cannot be shown again. */
export const createdLinkResponseSchema = z.object({
  id: z.number().int(),
  url: z.string(),
  expiresAt: z.number().int(),
});
export type CreatedLinkResponse = z.infer<typeof createdLinkResponseSchema>;

export const inviteSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
  usedAt: z.number().int().nullable(),
  revokedAt: z.number().int().nullable(),
  status: z.enum(['pending', 'used', 'expired', 'revoked']),
});
export type Invite = z.infer<typeof inviteSchema>;

export const adminUserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  name: z.string().nullable(),
  role: z.enum(['admin', 'user']),
  createdAt: z.number().int(),
  lastLoginAt: z.number().int().nullable(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

/** A blocked device or whole IP (timeouts are not listed); `device` is named from its User-Agent. */
export const adminBlockSchema = z.object({
  id: z.number().int(),
  kind: z.enum(['device', 'ip']),
  ip: z.string(),
  device: z.string().nullable(),
  blockedAt: z.number().int(),
  failCount: z.number().int(),
  lastEmail: z.string().nullable(),
});
export type AdminBlock = z.infer<typeof adminBlockSchema>;

/** Starts the passkey path of registration; the fields mean what they do in `registerRequestSchema`. */
export const passkeyRegisterOptionsRequestSchema = registerRequestSchema.omit({
  password: true,
});
export type PasskeyRegisterOptionsRequest = z.infer<
  typeof passkeyRegisterOptionsRequestSchema
>;

export const passkeyRecoverOptionsRequestSchema = z.object({
  token: tokenSchema,
});
export type PasskeyRecoverOptionsRequest = z.infer<
  typeof passkeyRecoverOptionsRequestSchema
>;

/** `options` goes to the browser's WebAuthn call as is; `challengeId` comes back with its answer. */
export interface PasskeyOptionsResponse {
  challengeId: string;
  options: unknown;
}

/** The authenticator's answer; the server checks it, the schema only its shape. */
export const passkeyVerifyRequestSchema = z.object({
  challengeId: z.string().min(1).max(64),
  response: z.looseObject({
    id: z.string().min(1).max(1024),
    response: z.looseObject({ userHandle: z.string().max(1024).optional() }),
  }),
});
export type PasskeyVerifyRequest = z.infer<typeof passkeyVerifyRequestSchema>;

export const passkeyRenameRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type PasskeyRenameRequest = z.infer<typeof passkeyRenameRequestSchema>;

export const passkeySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  createdAt: z.number().int(),
  lastUsedAt: z.number().int().nullable(),
});
export type Passkey = z.infer<typeof passkeySchema>;
