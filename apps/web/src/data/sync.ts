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
  // A client from before the awards stores has rev > 0 and empty stores: one pull from 0 fills them (ADR-0032 §4).
  const full = !(await db.get('kv', 'fullSyncAt'));
  let since = full ? 0 : (((await db.get('kv', 'rev')) as number) ?? 0);
  for (;;) {
    const page = await api(`/api/sync?since=${since}`, syncResponse);
    await apply(db, page, full && !page.more);
    emitChange();
    if (!page.more) return;
    since = page.rev;
  }
}

/** One page, one transaction: a broken pull never leaves `rev` ahead of the data. */
async function apply(db: Db, page: SyncResponse, fullDone: boolean) {
  const tx = db.transaction(
    [
      'meals',
      'outbox',
      'kv',
      'weighings',
      'recipes',
      'awards',
      'challengeMonths',
      'drinks',
      'drinkEntries',
      'waterGoals',
    ],
    'readwrite',
  );
  const meals = tx.objectStore('meals');
  const kv = tx.objectStore('kv');
  const outbox = tx.objectStore('outbox');
  const pending = outbox.index('clientId');
  const parked = async (clientId: string) =>
    (await pending.getAll(clientId)).find((o) => o.conflict);
  for (const meal of page.meals) {
    const op = await parked(meal.clientId);
    // A parked edit is compared with the newest version there (ADR-0022 §3).
    if (op)
      await outbox.put({ ...op, conflict: { kind: 'edit', theirs: meal } });
    // A local unsent change wins over the server copy until it is sent (OCT-77).
    else if (!(await pending.count(meal.clientId))) await meals.put(meal);
  }
  for (const clientId of page.deletedMealClientIds) {
    const op = await parked(clientId);
    // A parked edit keeps its local copy: the user may restore it.
    if (op)
      await outbox.put({
        ...op,
        conflict: { kind: 'deleted', deletedAt: Date.now() },
      });
    // Otherwise deletion beats a local edit.
    else await meals.delete(clientId);
  }
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
  const recipes = tx.objectStore('recipes');
  for (const recipe of page.recipes ?? []) await recipes.put(recipe);
  for (const id of page.deletedRecipeIds ?? []) await recipes.delete(id);
  // A queued op wins until it is sent; its answer brings the server's merge.
  if (!(await pending.count('awards')))
    for (const award of page.awards ?? [])
      await tx.objectStore('awards').put(award);
  for (const month of page.challengeMonths ?? [])
    if (!(await pending.count(`challenge:${month.month}`)))
      await tx.objectStore('challengeMonths').put(month);
  const drinks = tx.objectStore('drinks');
  for (const d of page.drinks ?? [])
    await (d.deleted ? drinks.delete(d.id) : drinks.put(d));
  const entries = tx.objectStore('drinkEntries');
  for (const e of page.drinkEntries ?? [])
    if (await pending.count(`drink:${e.clientId}`)) continue;
    else await (e.deleted ? entries.delete(e.clientId) : entries.put(e));
  const goals = tx.objectStore('waterGoals');
  for (const g of page.waterGoals ?? []) await goals.put(g);
  await kv.put(page.rev, 'rev');
  await kv.put(Date.now(), 'pulledAt');
  if (fullDone) await kv.put(Date.now(), 'fullSyncAt');
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
  // A new weight writes today's weighing on the server (AC-9.10): fetch it, don't wait for the network.
  // shortcut: a pull already running is reused and may miss that weighing; the next pull brings it.
  void pull(db).catch(() => {});
  return profile;
}
