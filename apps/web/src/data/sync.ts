import { z } from 'zod';
import type { IDBPTransaction, StoreNames } from 'idb';
import type { ProfileResponse, SyncResponse } from '@oct/shared';
import { api } from '../api/client';
import { emitChange } from './changes';
import type { Choices, Db, OctDb } from './db';

// Our own server: trust the shape, no full Meal schema on the client.
const syncResponse = z.custom<SyncResponse>();

const running = new WeakMap<Db, Promise<void>>();

/**
 * Brings the local copy up to date with `GET /api/sync` (ADR-0011 §3).
 * One pull per database at a time: a second call gets the running one.
 */
export function pull(db: Db): Promise<void> {
  let p = running.get(db);
  if (!p) {
    p = pullPages(db).finally(() => running.delete(db));
    running.set(db, p);
  }
  return p;
}

async function pullPages(db: Db) {
  let more = true;
  while (more) {
    const since = ((await db.get('kv', 'rev')) as number | undefined) ?? 0;
    const page = await api(`/api/sync?since=${since}`, syncResponse);
    await apply(db, page);
    emitChange();
    more = page.more;
  }
}

/** One page, one transaction: a broken pull never leaves `rev` ahead of the data. */
async function apply(db: Db, page: SyncResponse) {
  const tx = db.transaction(
    ['meals', 'outbox', 'kv', 'weighings'],
    'readwrite',
  );
  const meals = tx.objectStore('meals');
  const kv = tx.objectStore('kv');
  const pending = tx.objectStore('outbox').index('clientId');
  for (const meal of page.meals)
    // A local unsent change wins over the server copy until it is sent (OCT-77).
    if (!(await pending.count(meal.clientId))) await meals.put(meal);
  // Deletion beats a local edit.
  for (const clientId of page.deletedMealClientIds)
    await meals.delete(clientId);
  if (page.settings && !(await settingsQueued(pending)))
    await kv.put(page.settings, 'settings');
  // A save answered while this page was in flight is newer: keep it.
  const profile = (await kv.get('profile')) as ProfileResponse | undefined;
  if (page.profile && !(profile && profile.rev > page.profile.rev))
    await kv.put(page.profile, 'profile');
  const weighings = tx.objectStore('weighings');
  for (const { date, weightKg } of page.weighings ?? [])
    if (await pending.count(`weighing:${date}`)) continue;
    else if (weightKg === null) await weighings.delete(date);
    else await weighings.put({ date, weightKg });
  // The server's profile does not know the queued weighings yet.
  if (await weighingsQueued(pending)) await followLatest(tx);
  if (page.illustrationChoices) {
    const choices = { ...((await kv.get('choices')) as Choices | undefined) };
    for (const { nameKey, illustration } of page.illustrationChoices)
      if (await pending.count(`choice:${nameKey}`)) continue;
      else if (illustration) choices[nameKey] = illustration;
      else delete choices[nameKey];
    await kv.put(choices, 'choices');
  }
  await kv.put(page.rev, 'rev');
  await tx.done;
}

/** A queued settings or photo retention change wins over the server copy until it is sent. */
export const settingsQueued = async (pending: {
  count(clientId: string): Promise<number>;
}) =>
  (await pending.count('settings')) + (await pending.count('photoRetention')) >
  0;

/** Any weighing op in the queue, refused ones included: their local copy stays. */
export const weighingsQueued = async (pending: {
  count(query: IDBKeyRange): Promise<number>;
}) =>
  (await pending.count(IDBKeyRange.bound('weighing:', 'weighing:\uffff'))) > 0;

/**
 * The profile weight follows the latest local weighing, so the norm changes at once (ADR-0016 §4).
 * `rev` stays: a newer server profile still wins a pull. Without weighings or a stored profile: as is.
 */
export async function followLatest<S extends StoreNames<OctDb>[]>(
  anyTx: IDBPTransaction<OctDb, S, 'readwrite'>,
) {
  // idb types a transaction by its exact store list; callers all include these two.
  const tx = anyTx as unknown as IDBPTransaction<
    OctDb,
    ('weighings' | 'kv')[],
    'readwrite'
  >;
  const latest = (await tx.objectStore('weighings').openCursor(null, 'prev'))
    ?.value;
  const kv = tx.objectStore('kv');
  const p = (await kv.get('profile')) as ProfileResponse | undefined;
  if (!latest || !p || p.profile.weightKg === latest.weightKg) return;
  await kv.put(
    { ...p, profile: { ...p.profile, weightKg: latest.weightKg } },
    'profile',
  );
}

/** The answer of a profile save (or an applied goal) into the local copy: every screen re-reads the norm. */
export async function storeProfile(db: Db, profile: ProfileResponse) {
  await db.put('kv', profile, 'profile');
  emitChange();
  return profile;
}
