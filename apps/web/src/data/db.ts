import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AccountSettings,
  AiStatus,
  Integrations,
  AccountSettingsPatch,
  IllustrationChoiceInput,
  IllustrationId,
  Meal,
  MealInput,
  MealPatch,
  MeResponse,
  PhotoRetention,
  Product,
  ProfileResponse,
  Recipe,
  Weighing,
} from '@oct/shared';

/** Bump with a new `oldVersion` branch in `upgrade` when the stores change. */
export const DB_VERSION = 4;

export interface OctDb extends DBSchema {
  meals: { key: string; value: Meal; indexes: { localDate: string } };
  /** Unsent changes, in order (OCT-77). */
  outbox: { key: number; value: Op; indexes: { clientId: string } };
  kv: {
    /** `aiStatus`, `integrations`: the last GET /api/ai/status, /api/integrations, shown offline. */
    key:
      | 'rev'
      | 'me'
      | 'settings'
      | 'choices'
      | 'profile'
      | 'aiStatus'
      | 'integrations';
    value:
      | number
      | MeResponse
      | AccountSettings
      | Choices
      | ProfileResponse
      | AiStatus
      | Integrations;
  };
  /** Photos taken offline, by meal clientId (OCT-77). */
  photos: { key: string; value: Blob };
  /** The weight diary, one weighing per day (ADR-0016 §4). */
  weighings: { key: string; value: Weighing };
  /** Recipes, read-only offline (ADR-0023 §4). */
  recipes: { key: number; value: Recipe };
  /** Products found by barcode and the user's own, for the offline lookup (ADR-0034 §7). */
  products: { key: string; value: Product };
}

/**
 * One queued change (ADR-0011 §4). `clientId` groups the ops of one meal;
 * settings use `settings`, the photo period `photoRetention`, an illustration choice `choice:<nameKey>`,
 * a weighing `weighing:<date>`.
 * `id` is the meal's server id, 0 until its createMeal is answered.
 * `error` is the code of a refused op: it stays for the badge and is not resent.
 * `sent` marks a createMeal that went out at least once: the server may already have it.
 * `conflict` parks a patchMeal made on an older version: it waits for the user's choice (ADR-0022 §3).
 */
export type Op = {
  seq?: number;
  clientId: string;
  error?: string;
  sent?: true;
  conflict?: Conflict;
} & (
  | { kind: 'uploadPhoto' }
  | { kind: 'createMeal'; body: MealInput }
  | { kind: 'patchMeal'; id: number; body: MealPatch }
  | { kind: 'deleteMeal'; id: number }
  | { kind: 'patchSettings'; body: AccountSettingsPatch }
  | { kind: 'putIllustrationChoice'; body: IllustrationChoiceInput }
  | { kind: 'putPhotoRetention'; body: PhotoRetention }
  | { kind: 'putWeighing'; body: Weighing }
  | { kind: 'deleteWeighing'; date: string }
);

/** `edit`: the server has a newer edit, `theirs`; `deleted`: the meal was deleted there. */
export type Conflict =
  { kind: 'edit'; theirs: Meal } | { kind: 'deleted'; deletedAt: number };

/** Remembered illustration per dish nameKey. */
export type Choices = Record<string, IllustrationId>;

export type Db = IDBPDatabase<OctDb>;

export const dbName = (userId: number) => `oct-${userId}`;

/** The user's own database (ADR-0011 §2). */
export function openUserDb(userId: number) {
  return openDB<OctDb>(dbName(userId), DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('meals', { keyPath: 'clientId' }).createIndex(
          'localDate',
          'localDate',
        );
        db.createObjectStore('outbox', {
          keyPath: 'seq',
          autoIncrement: true,
        }).createIndex('clientId', 'clientId');
        db.createObjectStore('kv');
        db.createObjectStore('photos');
      }
      if (oldVersion < 2)
        db.createObjectStore('weighings', { keyPath: 'date' });
      if (oldVersion < 3) db.createObjectStore('recipes', { keyPath: 'id' });
      if (oldVersion < 4) db.createObjectStore('products', { keyPath: 'code' });
    },
    // Another tab (or clearLocal) deletes or upgrades the base: let it through.
    blocking(_current, _blocked, event) {
      (event.target as IDBDatabase).close();
    },
  });
}
