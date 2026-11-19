import { z } from 'zod';
import type { IDBPTransaction } from 'idb';
import {
  matchIllustration,
  nameKey,
  type AccountSettings,
  type AccountSettingsPatch,
  type IllustrationChoice,
  type IllustrationId,
  type Meal,
  type MealInput,
  type MealPatch,
  type PhotoRetentionDays,
  type ProfileResponse,
  type WeighingDeleteResponse,
  type WeighingPutResponse,
} from '@oct/shared';
import { api, ApiError } from '../api/client';
import { emitChange } from './changes';
import type { Choices, Db, Op, OctDb } from './db';
import { followLatest, pull, settingsQueued, weighingsQueued } from './sync';

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
  ('meals' | 'outbox' | 'kv' | 'photos' | 'weighings')[],
  'readwrite'
>;

/** Changes the local copy and the queue in one transaction, then sends (ADR-0011 §4). */
async function local(db: Db, change: (tx: Tx) => Promise<void>) {
  const tx = db.transaction(
    ['meals', 'outbox', 'kv', 'photos', 'weighings'],
    'readwrite',
  );
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
  const { items, photoId, ...fields } = change;
  const next = { ...meal, ...fields };
  // The server sets `full` by the retention setting; the sync brings it.
  if (photoId) next.photo = { id: photoId, full: true };
  if (!items) return next;
  next.items = items.map(({ illustration, confidence, recipeId, ...item }) => ({
    ...item,
    recipeId: recipeId ?? null,
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
    let ops = await queued(db, tx, clientId);
    if (ops.some((o) => o.error)) ops = await retry(tx, ops);
    const create = ops.find((o) => o.kind === 'createMeal');
    const last = ops.at(-1);
    // Merge into the last op only: an older op after it would overwrite this edit.
    // A sent createMeal may be on the server already, and a resend ignores its body.
    if (last?.kind === 'createMeal' && !last.error && !last.sent)
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

/**
 * Saving a refused meal again sends its ops once more (OCT-206). A refused create is not
 * on the server: it goes out unsent with its later edits folded in, or a fixed time would
 * still follow the refused one. A refused photo is dropped with its blob; the meal goes without it.
 */
async function retry(tx: Tx, ops: Op[]) {
  const outbox = tx.objectStore('outbox');
  const kept: Op[] = [];
  for (const o of ops) {
    const create = kept.find((k) => k.kind === 'createMeal');
    if (o.kind === 'uploadPhoto' && o.error) {
      await outbox.delete(o.seq!);
      await tx.objectStore('photos').delete(o.clientId);
    } else if (o.kind === 'patchMeal' && create?.kind === 'createMeal') {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { editedAt, ...patch } = o.body;
      create.body = { ...create.body, ...patch };
      await outbox.delete(o.seq!);
    } else {
      const next = { ...o };
      delete next.error;
      if (next.kind === 'createMeal') delete next.sent;
      kept.push(next);
    }
  }
  for (const o of kept) await outbox.put(o);
  return kept;
}

export function deleteMeal(db: Db, clientId: string) {
  return local(db, async (tx) => {
    const meal = await tx.objectStore('meals').get(clientId);
    if (!meal) return;
    await tx.objectStore('meals').delete(clientId);
    await tx.objectStore('photos').delete(clientId);
    const outbox = tx.objectStore('outbox');
    const ops = await queued(db, tx, clientId);
    const create = ops.find((o) => o.kind === 'createMeal');
    // A sent createMeal stays: its resend gives the id the delete needs.
    const keep = create?.sent && !create.error ? create : undefined;
    for (const o of ops) if (o !== keep) await outbox.delete(o.seq!);
    // Never sent or refused: the server has nothing to delete.
    if (create && !keep) return;
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
      // Stamped when the user picks, not when sent: an older offline choice loses on the server.
      body: { name, illustration, editedAt: Date.now() },
    };
    const outbox = tx.objectStore('outbox');
    if (last && !last.error) await outbox.put({ ...op, seq: last.seq });
    else await outbox.add(op);
  });
}

/** Keeps full photos `days` days from the meal time; one op, the last choice wins. */
export function putPhotoRetention(db: Db, days: PhotoRetentionDays) {
  return local(db, async (tx) => {
    const kv = tx.objectStore('kv');
    const settings = (await kv.get('settings')) as AccountSettings | undefined;
    if (settings)
      await kv.put({ ...settings, photoRetentionDays: days }, 'settings');
    const clientId = 'photoRetention';
    const last = (await queued(db, tx, clientId)).at(-1);
    const op: Op = { kind: 'putPhotoRetention', clientId, body: { days } };
    const outbox = tx.objectStore('outbox');
    if (last && !last.error) await outbox.put({ ...op, seq: last.seq });
    else await outbox.add(op);
  });
}

/** Records the day's weight (`YYYY-MM-DD`); moving a weighing to another day is delete + put. */
export const putWeighing = (db: Db, date: string, weightKg: number) =>
  weighing(db, {
    kind: 'putWeighing',
    clientId: `weighing:${date}`,
    body: { date, weightKg },
  });

/** Always queued: the day may be on the server already, and the DELETE is idempotent. */
export const deleteWeighing = (db: Db, date: string) =>
  weighing(db, { kind: 'deleteWeighing', clientId: `weighing:${date}`, date });

function weighing(db: Db, op: Op & { kind: 'putWeighing' | 'deleteWeighing' }) {
  return local(db, async (tx) => {
    const weighings = tx.objectStore('weighings');
    if (op.kind === 'putWeighing') await weighings.put(op.body);
    else await weighings.delete(op.date);
    // One op per day: the new one replaces an unsent or refused one.
    const outbox = tx.objectStore('outbox');
    for (const o of await queued(db, tx, op.clientId))
      await outbox.delete(o.seq!);
    await outbox.add(op);
    await followLatest(tx);
  });
}

const DAY_MS = 86_400_000;

/** Full photos a shorter period deletes now, by the local copy (OCT-25 §4); as the server's expiry. */
export async function expiringPhotos(
  db: Db,
  days: PhotoRetentionDays,
  now = Date.now(),
) {
  if (days === null) return 0;
  return (await db.getAll('meals')).filter(
    (m) => m.photo?.full && Date.parse(m.eatenAt) + days * DAY_MS < now,
  ).length;
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
    let op = (await db.getAll('outbox')).find((o) => !o.error);
    if (!op) break;
    s.sending = op.seq;
    if (op.kind === 'createMeal' && !op.sent)
      await db.put('outbox', (op = { ...op, sent: true }));
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
      // A safeguard: offline, the refused local value stays until the next change.
      await restore(db, op).catch(() => {});
    } finally {
      s.sending = undefined;
    }
    emitChange();
  }
  await pull(db);
  return true;
}

const mealSchema = z.custom<Meal>();
const putSchema = z.custom<WeighingPutResponse>();
const deleteSchema = z.custom<WeighingDeleteResponse>();
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
      break;
    case 'putPhotoRetention':
      await api('/api/account/photo-retention', z.unknown(), {
        method: 'PUT',
        body: op.body,
      });
      break;
    case 'putWeighing':
      return weighed(
        db,
        op,
        (
          await api(`/api/weighings/${op.body.date}`, putSchema, {
            method: 'PUT',
            body: { weightKg: op.body.weightKg },
          })
        ).profile,
      );
    case 'deleteWeighing':
      return weighed(
        db,
        op,
        (
          await api(`/api/weighings/${op.date}`, deleteSchema, {
            method: 'DELETE',
          })
        ).profile,
      );
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

/** The server's profile, with the weight of weighings still queued on top. */
async function weighed(db: Db, op: Op, profile: ProfileResponse) {
  const tx = db.transaction(['outbox', 'kv', 'weighings'], 'readwrite');
  const outbox = tx.objectStore('outbox');
  await outbox.delete(op.seq!);
  await tx.objectStore('kv').put(profile, 'profile');
  if (await weighingsQueued(outbox.index('clientId'))) await followLatest(tx);
  await tx.done;
}

const notMeal = (op: Op) =>
  op.kind === 'patchSettings' ||
  op.kind === 'putIllustrationChoice' ||
  op.kind === 'putPhotoRetention';

async function refuse(db: Db, op: Op, err: ApiError) {
  const tx = db.transaction(['outbox', 'meals'], 'readwrite');
  const outbox = tx.objectStore('outbox');
  const creates = op.kind === 'createMeal' || op.kind === 'uploadPhoto';
  // Nothing marks a refused settings or choice op: drop it, restore() takes the server's value back.
  // 404 on an edit or delete: the meal is already gone on the server.
  if (
    notMeal(op) ||
    (err.status === 404 &&
      (op.kind === 'patchMeal' || op.kind === 'deleteMeal'))
  )
    await outbox.delete(op.seq!);
  // A refused create of a meal deleted here: no badge can show it, so drop all its ops.
  else if (creates && !(await tx.objectStore('meals').get(op.clientId)))
    for (const o of await outbox.index('clientId').getAll(op.clientId))
      await outbox.delete(o.seq!);
  else {
    await outbox.put({ ...op, error: err.code });
    // Without the meal on the server its later ops would go out with id 0.
    if (creates)
      for (const o of await outbox.index('clientId').getAll(op.clientId))
        if (!o.error) await outbox.put({ ...o, error: err.code });
  }
  await tx.done;
}

const settingsSchema = z.custom<AccountSettings>();
const choicesSchema = z.custom<IllustrationChoice[]>();

/** A refused op changed only the local copy: put the server's value back, unless a newer change waits. */
async function restore(db: Db, op: Op) {
  if (op.kind === 'patchSettings' || op.kind === 'putPhotoRetention') {
    const settings = await api('/api/account/settings', settingsSchema);
    const tx = db.transaction(['outbox', 'kv'], 'readwrite');
    if (!(await settingsQueued(tx.objectStore('outbox').index('clientId'))))
      await tx.objectStore('kv').put(settings, 'settings');
    await tx.done;
  } else if (op.kind === 'putIllustrationChoice') {
    const key = nameKey(op.body.name);
    const server = (
      await api('/api/illustrations/choices', choicesSchema)
    ).find((c) => c.nameKey === key)?.illustration;
    const tx = db.transaction(['outbox', 'kv'], 'readwrite');
    const kv = tx.objectStore('kv');
    // Only this nameKey: the other choices may still be in the queue.
    if (
      !(await tx.objectStore('outbox').index('clientId').count(op.clientId))
    ) {
      const choices = { ...((await kv.get('choices')) as Choices | undefined) };
      if (server) choices[key] = server;
      else delete choices[key];
      await kv.put(choices, 'choices');
    }
    await tx.done;
  }
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

/** The code the server refused a meal's first op with; null when none was refused. */
export async function mealError(db: Db, clientId: string) {
  const ops = await db.getAllFromIndex('outbox', 'clientId', clientId);
  return ops.find((o) => o.error)?.error ?? null;
}

/** Unsent changes, refused meal ops included: they are lost on sign-out. Refused settings and choices are dropped. */
export const pendingCount = (db: Db) => db.count('outbox');
