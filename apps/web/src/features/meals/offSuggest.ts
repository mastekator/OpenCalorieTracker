import type { PhotoBarcodesResponse } from '@oct/shared';

const DAY_MS = 86_400_000;
export const OFF_HINT_DAYS = 30;

/**
 * OCT-313 2.5: a code the server did not look up because the user's switch is off. The server
 * checks the admin's ban first, so `disabled` already means not blocked and not enabled.
 */
export const showOffSuggest = (
  codes: PhotoBarcodesResponse['codes'],
  offHintAt: string | null | undefined,
  now: Date,
) =>
  codes.some((c) => c.result.off === 'disabled') &&
  (!offHintAt ||
    now.getTime() - Date.parse(offHintAt) >= OFF_HINT_DAYS * DAY_MS);
