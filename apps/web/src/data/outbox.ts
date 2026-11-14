import { z } from 'zod';
import type { IDBPTransaction } from 'idb';
import {
  matchIllustration,
  nameKey,
  type AccountSettings,
  type AccountSettingsPatch,
  type IllustrationId,
  type Meal,
  type MealInput,
  type MealPatch,
} from '@oct/shared';
import { api, ApiError } from '../api/client';
import { emitChange } from './changes';
import type { Choices, Db, Op, OctDb } from './db';
import { pull } from './sync';

const MIN_DELAY = 5_000;
const MAX_DELAY = 5 * 60_000;

type State = {
  delay: number;
  timer?: ReturnType<typeof setTimeout>;
  /** seq of the op being sent: merging must not touch it. */
  sending?: number;
  /** 409 client_outdated: nothing is sent until the page reloads. */
  outdated?: boolean;
  running?: Promise<void>;
  again?: boolean;
};
// Per database, like `running` in sync.ts: a user switch starts clean.
const states = new WeakMap<Db, State>();
const stateOf = (db: Db) => {
  let s = states.get(db);
  if (!s) states.set(db, (s = { delay: MIN_DELAY }));
  return s;
};

type Tx = IDBPTransaction<
  OctDb,
  ('meals' | 'outbox' | 'kv' | 'photos')[],
  'readwrite'
>;

/** Changes the local copy and the queue in one transaction, then sends (ADR-0011 §4). */
async function local(db: Db, change: (tx: Tx) => Promise<void>) {
  const tx = db.transaction(['meals', 'outbox', 'kv', 'photos'], 'readwrite');
  await change(tx);
  await tx.done;
  emitChange();
  void flush(db).catch(() => {}); // offline: retried on backoff or the next trigger
}

/** Queued ops of one clientId that are not being sent right now, in order. */
const queued = async (db: Db, tx: Tx, clientId: string) =>
  (await tx.objectStore('outbox').index('clientId').getAll(clientId)).filter(
    (o) => o.seq !== stateOf(db).sending,
  );

const choicesOf = async (tx: Tx) =>
  ((await tx.objectStore('kv').get('choices')) as Choices | undefined) ?? {};

/** The local copy after a change; the server's answer replaces it later. */
function withChange(
  meal: Meal,
  change: Omit<MealPatch, 'editedAt'>,
  choices: Choices,
): Meal {
  const { items, ...fields } = change;
  const next = { ...meal, ...fields };
  if (!items) return next;
  next.items = items.map(({ illustration, confidence, ...item }) => ({
    ...item,
    aiProvider: null,
    aiModel: null,
    confidence: confidence ?? null,
    illustration:
      illustration ??
      choices[nameKey(item.name)] ??
      matchIllustration(item.name),
    illustrationManual: illustration !== undefined,
  }));
  for (const k of ['kcal', 'proteinG', 'fatG', 'carbsG'] as const)
    next[k] = next.items.reduce((s, i) => s + i[k], 0);
  return next;
}

/**
 * Saves a new meal. `photo` is a photo taken offline: it is uploaded first
 * and its photoId goes into the meal (ADR-0008); until then `photo` is null.
 */
export function createMeal(db: Db, input: MealInput, photo?: Blob) {
  return local(db, async (tx) => {
    const { clientId, photoId, items, recalcOffer, ...when } = input;
    const meal: Meal = {
      id: 0,
      clientId,
      ...when,
      recalcOffer: recalcOffer ?? false,
      photo: photoId ? { id: photoId, full: true } : null,
      items: [],
      kcal: 0,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
    };
    await tx
      .objectStore('meals')
      .put(withChange(meal, { items }, await choicesOf(tx)));
    const outbox = tx.objectStore('outbox');
    if (photo) {
      await tx.objectStore('photos').put(photo, clientId);
      await outbox.add({ kind: 'uploadPhoto', clientId });
    }
    await outbox.add({ kind: 'createMeal', clientId, body: input });
  });
}

/** Edits a meal; last edit wins on the server by `editedAt` = now. */
export function patchMeal(
  db: Db,
  clientId: string,
  patch: Omit<MealPatch, 'editedAt'>,
) {
  const editedAt = Date.now();
  return local(db, async (tx) => {
    const meals = tx.objectStore('meals');
    const meal = await meals.get(clientId);
    if (!meal) return;
    await meals.put(withChange(meal, patch, await choicesOf(tx)));
    const outbox = tx.objectStore('outbox');
    const ops = await queued(db, tx, clientId);
    const create = ops.find((o) => o.kind === 'createMeal');
    const last = ops.at(-1);
    // Merge into the last op only: an older op after it would overwrite this edit.
    if (last?.kind === 'createMeal' && !last.error)
      await outbox.put({ ...last, body: { ...last.body, ...patch } });
    else if (last?.kind === 'patchMeal' && !last.error)
      await outbox.put({
        ...last,
        body: { ...last.body, ...patch, editedAt } as MealPatch,
      });
    else
      await outbox.add({
        kind: 'patchMeal',
        clientId,
        // id 0 while its createMeal is in flight: the answer fills it in.
        id: meal.id,
        body: { ...patch, editedAt } as MealPatch,
        // A meal the server refused to create cannot be edited there either.
        error: create?.error,
      });
  });
}

export function deleteMeal(db: Db, clientId: string) {
  return local(db, async (tx) => {
    const meal = await tx.objectStore('meals').get(clientId);
    if (!meal) return;
    await tx.objectStore('meals').delete(clientId);
    await tx.objectStore('photos').delete(clientId);
    const outbox = tx.objectStore('outbox');
    const ops = await queued(db, tx, clientId);
    for (const o of ops) await outbox.delete(o.seq!);
    // Never sent: the server has nothing to delete.
    if (ops.some((o) => o.kind === 'createMeal')) return;
    await outbox.add({ kind: 'deleteMeal', clientId, id: meal.id });
  });
}

export function patchSettings(
  db: Db,
  patch: Omit<AccountSettingsPatch, 'editedAt'>,
) {
  const editedAt = Date.now();
  return local(db, async (tx) => {
    const kv = tx.objectStore('kv');
    const settings = (await kv.get('settings')) as AccountSettings | undefined;
    if (settings) await kv.put({ ...settings, ...patch }, 'settings');
    const last = (await queued(db, tx, 'settings')).at(-1);
    const outbox = tx.objectStore('outbox');
    if (last?.kind === 'patchSettings' && !last.error)
      await outbox.put({ ...last, body: { ...last.body, ...patch, editedAt } });
    else
      await outbox.add({
        kind: 'patchSettings',
        clientId: 'settings',
        body: { ...patch, editedAt },
      });
  });
}

/** Remembers an illustration for a dish name; null = back to automatic. */
export function putIllustrationChoice(
  db: Db,
  name: string,
  illustration: IllustrationId | null,
) {
  const key = nameKey(name);
  return local(db, async (tx) => {
    const kv = tx.objectStore('kv');
    const choices = { ...(await choicesOf(tx)) };
    if (illustration) choices[key] = illustration;
    else delete choices[key];
    await kv.put(choices, 'choices');
    const clientId = `choice:${key}`;
    const last = (await queued(db, tx, clientId)).at(-1);
    const op: Op = {
      kind: 'putIllustrationChoice',
      clientId,
      body: { name, illustration },
    };
    const outbox = tx.objectStore('outbox');
    if (last && !last.error) await outbox.put({ ...op, seq: last.seq });
    else await outbox.add(op);
  });
}

/**
 * Sends the queue one op at a time, in order, then pulls (ADR-0011 §4).
 * One run per database; a call during a run makes it go round once more.
 */
export function flush(db: Db): Promise<void> {
  const s = stateOf(db);
  if (s.running) {
    s.again = true;
    return s.running;
  }
  s.running = (async () => {
    for (;;) {
      s.again = false;
      if (!(await send(db, s)) || !s.again) return;
    }
  })().finally(() => (s.running = undefined));
  return s.running;
}

/** True when the queue was emptied (refused ops aside) and pulled. */
async function send(db: Db, s: State): Promise<boolean> {
  if (s.outdated) return false;
  clearTimeout(s.timer);
  for (;;) {
    const op = (await db.getAll('outbox')).find((o) => !o.error);
    if (!op) break;
    s.sending = op.seq;
    try {
      await deliver(db, op);
      s.delay = MIN_DELAY;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (err.status === 0 || err.status >= 500) {
        s.timer = setTimeout(() => void flush(db).catch(() => {}), s.delay);
        s.delay = Math.min(s.delay * 2, MAX_DELAY);
        return false;
      }
      // api() has already raised "session expired"; a new sign-in remounts DataProvider.
      if (err.status === 401) return false;
      if (err.code === 'client_outdated') {
        s.outdated = true;
        return false;
      }
      await refuse(db, op, err);
    } finally {
      s.sending = undefined;
    }
    emitChange();
  }
  await pull(db);
  return true;
}

const mealSchema = z.custom<Meal>();
const photoSchema = z.object({ photoId: z.string() });

async function deliver(db: Db, op: Op) {
  switch (op.kind) {
    case 'uploadPhoto':
      return upload(db, op);
    case 'createMeal':
      return saved(
        db,
        op,
        await api('/api/meals', mealSchema, { method: 'POST', body: op.body }),
      );
    case 'patchMeal':
      return saved(
        db,
        op,
        await api(`/api/meals/${op.id}`, mealSchema, {
          method: 'PATCH',
          body: op.body,
        }),
      );
    case 'deleteMeal':
      await api(`/api/meals/${op.id}`, z.unknown(), { method: 'DELETE' });
      break;
    case 'patchSettings':
      // The new settings come back with the pull at the end of flush().
      await api('/api/account/settings', z.unknown(), {
        method: 'PATCH',
        body: op.body,
      });
      break;
    case 'putIllustrationChoice':
      await api('/api/illustrations/choices', z.unknown(), {
        method: 'PUT',
        body: op.body,
      });
  }
  await db.delete('outbox', op.seq!);
}

async function upload(db: Db, op: Op) {
  const blob = await db.get('photos', op.clientId);
  // shortcut: a break after the upload sends the photo again; sweepPhotos removes the orphan.
  const photoId = blob
    ? (await api('/api/photos', photoSchema, { method: 'POST', body: blob }))
        .photoId
    : undefined;
  const tx = db.transaction(['outbox', 'photos'], 'readwrite');
  const outbox = tx.objectStore('outbox');
  await outbox.delete(op.seq!);
  await tx.objectStore('photos').delete(op.clientId);
  for (const o of await outbox.index('clientId').getAll(op.clientId))
    if (photoId && o.kind === 'createMeal')
      await outbox.put({ ...o, body: { ...o.body, photoId } });
  await tx.done;
}

/** The server's meal: later ops of it learn its id; with none left it replaces the local copy. */
async function saved(db: Db, op: Op, meal: Meal) {
  const tx = db.transaction(['outbox', 'meals'], 'readwrite');
  const outbox = tx.objectStore('outbox');
  const meals = tx.objectStore('meals');
  await outbox.delete(op.seq!);
  const later = await outbox.index('clientId').getAll(op.clientId);
  for (const o of later)
    if ((o.kind === 'patchMeal' || o.kind === 'deleteMeal') && !o.id)
      await outbox.put({ ...o, id: meal.id });
  const local = await meals.get(op.clientId);
  if (!later.length) await meals.put(meal);
  else if (local) await meals.put({ ...local, id: meal.id });
  await tx.done;
}

async function refuse(db: Db, op: Op, err: ApiError) {
  const tx = db.transaction('outbox', 'readwrite');
  // 404 on an edit or delete: the meal is already gone on the server.
  if (
    err.status === 404 &&
    (op.kind === 'patchMeal' || op.kind === 'deleteMeal')
  )
    await tx.store.delete(op.seq!);
  else {
    await tx.store.put({ ...op, error: err.code });
    // Without the meal on the server its later ops would go out with id 0.
    if (op.kind === 'createMeal' || op.kind === 'uploadPhoto')
      for (const o of await tx.store.index('clientId').getAll(op.clientId))
        if (!o.error) await tx.store.put({ ...o, error: err.code });
  }
  await tx.done;
}

export type MealStatus = 'pending' | 'error' | 'synced';

/** For the meal badge: unsent, refused by the server, or saved there. */
export async function mealStatus(
  db: Db,
  clientId: string,
): Promise<MealStatus> {
  const ops = await db.getAllFromIndex('outbox', 'clientId', clientId);
  if (!ops.length) return 'synced';
  return ops.some((o) => o.error) ? 'error' : 'pending';
}

/** Unsent changes, refused ones included: they are lost on sign-out. */
export const pendingCount = (db: Db) => db.count('outbox');
