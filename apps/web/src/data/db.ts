import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AccountSettings,
  AccountSettingsPatch,
  IllustrationChoiceInput,
  IllustrationId,
  Meal,
  MealInput,
  MealPatch,
  MeResponse,
} from '@oct/shared';

/** Bump with a new `oldVersion` branch in `upgrade` when the stores change. */
export const DB_VERSION = 1;

export interface OctDb extends DBSchema {
  meals: { key: string; value: Meal; indexes: { localDate: string } };
  /** Unsent changes, in order (OCT-77). */
  outbox: { key: number; value: Op; indexes: { clientId: string } };
  kv: {
    key: 'rev' | 'me' | 'settings' | 'choices';
    value: number | MeResponse | AccountSettings | Choices;
  };
  /** Photos taken offline, by meal clientId (OCT-77). */
  photos: { key: string; value: Blob };
}

/**
 * One queued change (ADR-0011 §4). `clientId` groups the ops of one meal;
 * settings use `settings`, an illustration choice `choice:<nameKey>`.
 * `id` is the meal's server id, 0 until its createMeal is answered.
 * `error` is the code of a refused op: it stays for the badge and is not resent.
 */
export type Op = { seq?: number; clientId: string; error?: string } & (
  | { kind: 'uploadPhoto' }
  | { kind: 'createMeal'; body: MealInput }
  | { kind: 'patchMeal'; id: number; body: MealPatch }
  | { kind: 'deleteMeal'; id: number }
  | { kind: 'patchSettings'; body: AccountSettingsPatch }
  | { kind: 'putIllustrationChoice'; body: IllustrationChoiceInput }
);

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
    },
    // Another tab (or clearLocal) deletes or upgrades the base: let it through.
    blocking(_current, _blocked, event) {
      (event.target as IDBDatabase).close();
    },
  });
}
