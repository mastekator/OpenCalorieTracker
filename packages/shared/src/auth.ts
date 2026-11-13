import { z } from 'zod';

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
  locale: z.string(),
  theme: z.string(),
  /** The admin still signs in with ADMIN_PASSWORD from the compose file (AC-1.7). */
  passwordFromConfig: z.boolean(),
  /** Sign-in methods the user has set up, whether or not they are enabled. */
  methods: z.array(authMethodSchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
