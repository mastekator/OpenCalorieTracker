import { z } from 'zod';
import type { Drink, DrinkEntry, WaterGoal } from './drinks/drinks.js';
import type { IllustrationId } from './illustrations/dictionary.js';
import type { Meal } from './meals.js';
import type { ProfileResponse } from './norm/schemas.js';
import type { Recipe } from './recipes/recipes.js';
import type { AccountSettings } from './settings.js';
import type { ChallengeMonth, StoredAward } from './streaks/awards.js';

/** At most this many changes per `GET /api/sync` page. */
export const SYNC_PAGE_SIZE = 500;

/** `GET /api/sync?since=<rev>`: changes after the last `rev` the client applied (0 = everything). */
export const syncQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative(),
});

/**
 * Changes with `rev > since` (ADR-0011 §3). Ask again with `since = rev` while `more` is true.
 * `settings`, `illustrationChoices`, `profile`, `weighings`, recipes and drinks are omitted when unchanged.
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
  /** `weightKg: null` = deleted (ADR-0016 §4). */
  weighings?: { date: string; weightKg: number | null }[];
  /** Created or edited recipes, by rev (ADR-0023 §4). */
  recipes?: Recipe[];
  deletedRecipeIds?: number[];
  /** The user's own drinks, `deleted: true` included (ADR-0028 §3). */
  drinks?: Drink[];
  /** Drink entries, `deleted: true` included. */
  drinkEntries?: DrinkEntry[];
  /** Water goal history rows. */
  waterGoals?: WaterGoal[];
  /** Earned awards, by rev; never deleted (ADR-0032 §4). */
  awards?: StoredAward[];
  challengeMonths?: ChallengeMonth[];
}
