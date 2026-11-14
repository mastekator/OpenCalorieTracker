import type { InviteCheckResponse, LinkKind } from '@oct/shared';
import type { Key } from '../i18n/translate';

/** Why an invite or recovery link can't be used, as the texts of screen 2.4; null when it can. */
export function linkProblem(
  route: LinkKind,
  check: Pick<InviteCheckResponse, 'kind' | 'status'>,
): { title: Key; body: Key } | null {
  // A recovery token on /invite (or the reverse) reads as an invalid link (E-4.4).
  const status = check.kind === route ? check.status : 'invalid';
  if (status === 'valid') return null;
  const prefix = route === 'invite' ? 'link' : 'link.recovery';
  return {
    title: `${prefix}.${status}`,
    body:
      status === 'used'
        ? 'link.used_body'
        : route === 'invite'
          ? 'link.ask_admin'
          : 'link.recovery.ask_admin',
  };
}

/** The API error a submit got when the link stopped working meanwhile, as a link status. */
export const LINK_ERRORS = {
  invite_expired: 'expired',
  invite_used: 'used',
  invite_invalid: 'invalid',
} as const;

// Messenger webviews, where passkeys often fail (OCT-13 2.3). Android webviews mark themselves `; wv)`.
const IN_APP =
  /Telegram|Instagram|FBAN|FBAV|FB_IAB|\bLine\/|WhatsApp|VKAndroidApp|vkclient|; wv\)/i;

/** shortcut: a user-agent heuristic; a false hit only moves the default method to password. */
export const isInAppBrowser = (ua: string) => IN_APP.test(ua);
