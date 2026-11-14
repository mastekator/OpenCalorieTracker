import { z } from 'zod';
import type { IllustrationId } from './illustrations/dictionary.js';
import type { Meal } from './meals.js';
import type { ProfileResponse } from './norm/schemas.js';
import type { AccountSettings } from './settings.js';

/** At most this many changes per `GET /api/sync` page. */
export const SYNC_PAGE_SIZE = 500;

/** `GET /api/sync?since=<rev>`: changes after the last `rev` the client applied (0 = everything). */
export const syncQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative(),
});

/**
 * Changes with `rev > since` (ADR-0011 §3). Ask again with `since = rev` while `more` is true.
 * `settings`, `illustrationChoices` and `profile` are omitted when unchanged.
 */
export interface SyncResponse {
  rev: number;
  more: boolean;
  /** Created or edited meals, by rev. */
  meals: Meal[];
  deletedMealClientIds: string[];
  settings?: AccountSettings;
  /** A profile that was never saved is not sent. */
  profile?: ProfileResponse;
  /** `illustration: null` = back to automatic. */
  illustrationChoices?: {
    nameKey: string;
    illustration: IllustrationId | null;
  }[];
}
