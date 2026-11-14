import { deleteDB } from 'idb';
import type { MeResponse } from '@oct/shared';
import { dbName, openUserDb } from './db';
import { THUMBS_CACHE } from './thumbs';

const LAST_USER_KEY = 'oct.lastUser';

export type LastUser = { id: number; email: string };

export function getLastUser(): LastUser | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_USER_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function setLastUser({ id, email }: LastUser) {
  localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id, email }));
}

/**
 * Removes everything of the user from this device: sign-out and user switch (AC-2.7).
 * An open connection closes itself on the delete (`blocking` in openUserDb).
 */
export async function clearLocal(userId: number) {
  await deleteDB(dbName(userId));
  if (typeof caches !== 'undefined') await caches.delete(THUMBS_CACHE);
  if (getLastUser()?.id === userId) localStorage.removeItem(LAST_USER_KEY);
}

/** The last user saved on this device, for an offline start (E-8.10); null if none. */
export async function readOfflineUser(): Promise<MeResponse | null> {
  const last = getLastUser();
  if (!last) return null;
  const db = await openUserDb(last.id);
  try {
    return ((await db.get('kv', 'me')) as MeResponse | undefined) ?? null;
  } finally {
    db.close();
  }
}
