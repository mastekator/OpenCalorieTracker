import type { ErrorCode } from '@oct/shared';

// Source and fallback dictionary: keys and their types come from here (ADR-0004).
// A plural is an object with an `other` key plus the categories the language uses.
export const en = {
  common: {
    appName: 'OpenCalorieTracker',
    loading: 'Loading…',
    tryAgainIn: {
      one: 'Try again in {count} minute',
      other: 'Try again in {count} minutes',
    },
  },
  screens: {
    home: 'Today',
    login: 'Sign in',
    invite: 'Accept invitation',
    recover: 'Recover access',
    register: 'Create account',
  },
  errors: {
    validation_failed: 'Check the highlighted fields',
    unauthenticated: 'Please sign in',
    invalid_credentials: 'Wrong email or password',
    method_disabled: 'This sign-in method is turned off on this server',
    password_invalid: 'The password doesn’t meet the rules',
    password_too_common: 'This password is too common. Choose another',
    forbidden: 'You don’t have access to this',
    not_found: 'Not found',
    email_taken: 'This email is already registered',
    invite_used: 'This invitation has already been used',
    too_many_attempts: 'Too many attempts. Try again later',
    device_blocked: 'Sign-in from this device is temporarily blocked',
    ip_blocked: 'Sign-in from this network is temporarily blocked',
    not_configured: 'This feature isn’t set up on the server',
    ai_not_configured: 'AI recognition isn’t set up. Enter the meal manually',
    ai_no_vision: 'The configured AI model can’t read photos',
    ai_quota_exceeded: 'The AI provider’s limit is reached. Try later',
    ai_unavailable: 'The AI provider is unavailable. Try later',
    ai_invalid_response: 'The AI returned an unreadable answer. Try again',
    photo_too_large: 'The photo is too large',
    photo_invalid: 'This file isn’t a photo we can read',
    internal: 'Something went wrong. Try again',
  } satisfies Record<ErrorCode, string>,
};
