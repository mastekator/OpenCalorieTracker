import type { AuthMethod, MeResponse } from '@oct/shared';

/**
 * Sign-in methods switched on in AUTH_METHODS. A local copy saved before `enabledMethods`
 * existed lacks it until the next online start; until then every method counts as on.
 */
export const enabledMethods = (user: MeResponse): AuthMethod[] =>
  user.enabledMethods ?? ['password', 'passkey'];

/** Mirrors DELETE /account/passkeys/:id: the passkey may go if another enabled method stays (AC-6.2). */
export const isLastMethod = (user: MeResponse, passkeys: number) =>
  passkeys <= 1 &&
  !(
    enabledMethods(user).includes('password') &&
    user.methods.includes('password')
  );
