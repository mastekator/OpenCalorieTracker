import { z } from 'zod';
import type { IDBPTransaction } from 'idb';
import {
  BUILTIN_DRINKS,
  entryFrom,
  matchIllustration,
  nameKey,
  type AccountSettings,
  type AccountSettingsPatch,
  type ChallengeMonth,
  type ChallengeMonthPut,
  type DrinkEntry,
  type DrinkEntryInput,
  type IllustrationChoice,
  type IllustrationId,
  type Meal,
  type MealInput,
  type MealItem,
  type MealItemInput,
  type MealPatch,
  type PhotoRetentionDays,
  type Product,
  type ProfileResponse,
  type StoredAward,
  type WeighingDeleteResponse,
  type WeighingPutResponse,
} from '@oct/shared';
import { api, ApiError } from '../api/client';
import { emitChange } from './changes';
import { refreshMyProducts } from './products';
import type { Choices, Conflict, Db, Op, OctDb } from './db';
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
  (
    | 'meals'
    | 'outbox'
    | 'kv'
    | 'photos'
    | 'weighings'
    | 'products'
    | 'awards'
    | 'challengeMonths'
    | 'drinks'
    | 'drinkEntries'
  )[],
  'readwrite'
>;

/** Changes the local copy and the queue in one transaction, then sends (ADR-0011 §4). */
async function local<T>(db: Db, change: (tx: Tx) => Promise<T>) {
  const tx = db.transaction(
    [
      'meals',
      'outbox',
      'kv',
      'photos',
      'weighings',
      'products',
      'awards',
      'challengeMonths',
      'drinks',
      'drinkEntries',
    ],
    'readwrite',
  );
  const result = await change(tx);
  await tx.done;
  emitChange();
  void flush(db).catch(() => {}); // offline: retried on backoff or the next trigger
  return result;
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
  next.items = items.map(
    // `pack` is the product's, not the dish's (ADR-0037 §2).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ illustration, confidence, recipeId, barcode, pack, ...item }) => ({
      ...item,
      unit: item.unit ?? 'g',
      recipeId: recipeId ?? null,
      barcode: barcode ?? null,
      aiProvider: null,
      aiModel: null,
      confidence: confidence ?? null,
      illustration:
        illustration ??
        choices[nameKey(item.name)] ??
        matchIllustration(item.name),
      illustrationManual: illustration !== undefined,
    }),
  );
  // Sticky, as on the server (ADR-0032 §2).
  if (items.some((i) => i.source === 'ai')) next.recognized = true;
  for (const k of ['kcal', 'proteinG', 'fatG', 'carbsG'] as const)
    next[k] = next.items.reduce((s, i) => s + i[k], 0);
  return next;
}

/** The product the server makes of a manual dish (meals/routes.ts), until `refreshMyProducts` brings it. */
function ownProduct(
  item: MealInput['items'][number] & { barcode: string },
): Product {
  const per100 = (v: number) => Math.round((v * 1000) / item.grams) / 10;
  return {
    code: item.barcode,
    name: item.name,
    brand: null,
    kcal100: per100(item.kcal),
    protein100: per100(item.proteinG),
    fat100: per100(item.fatG),
    carbs100: per100(item.carbsG),
    per: item.unit ?? 'g',
    servingG: null,
    servingText: null,
    savedAt: new Date().toISOString(),
  };
}

/** The pack data sent with the dishes, kept on this device's products too: offline the next scan has it (AC-5.4). */
async function rememberPacks(tx: Tx, items: MealInput['items'] | undefined) {
  const products = tx.objectStore('products');
  for (const item of items ?? []) {
    const { barcode, pack } = item;
    if (!barcode || !pack) continue;
    // A manual dish is the user's product before the server says so: the next scan offline has it (OCT-419).
    const p =
      (await products.get(barcode)) ??
      (item.source === 'manual' && item.kcal > 0
        ? ownProduct({ ...item, barcode })
        : null);
    if (!p) continue;
    await products.put({
      ...p,
      packG: pack.packG ?? p.packG,
      pieces: pack.pieces ?? p.pieces,
      last: pack.amount ?? p.last,
    });
  }
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
    await rememberPacks(tx, items);
    const outbox = tx.objectStore('outbox');
    if (photo) {
      await tx.objectStore('photos').put(photo, clientId);
      await outbox.add({ kind: 'uploadPhoto', clientId });
    }
    await outbox.add({ kind: 'createMeal', clientId, body: input });
  });
}

/**
 * Edits a meal. The op carries `baseRev`, the `editRev` it was made on; a merged edit keeps the
 * first one's (ADR-0022 §3). A meal cached before v0.4 has none: then the later `editedAt` wins.
 */
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
    await rememberPacks(tx, patch.items);
    const outbox = tx.objectStore('outbox');
    let ops = await queued(db, tx, clientId);
    if (ops.some((o) => o.error)) ops = await retry(tx, ops);
    const create = ops.find((o) => o.kind === 'createMeal');
    const last = ops.at(-1);
    // Merge into the last op only: an older op after it would overwrite this edit.
    // A parked op takes the edit too: the choice is then made on the latest local version.
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
        body: { ...patch, editedAt, baseRev: meal.editRev } as MealPatch,
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

export const deleteMeal = (db: Db, clientId: string) =>
  local(db, (tx) => drop(db, tx, clientId));

async function drop(db: Db, tx: Tx, clientId: string) {
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
  // Never sent or refused, or deleted there already: the server has nothing to delete.
  if ((create && !keep) || ops.some((o) => o.conflict?.kind === 'deleted'))
    return;
  await outbox.add({ kind: 'deleteMeal', clientId, id: meal.id });
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

/** Replaces the unsent ops of `op.clientId` with `op`: its body already holds theirs. */
async function replaceQueued(db: Db, tx: Tx, op: Op) {
  const outbox = tx.objectStore('outbox');
  for (const o of await queued(db, tx, op.clientId))
    await outbox.delete(o.seq!);
  await outbox.add(op);
}

/** Stores earned awards; as on the server, never taken back: the earlier day and `seen` win (ADR-0032 §3). */
export const putAwards = (db: Db, awards: StoredAward[]) =>
  local(db, async (tx) => {
    const store = tx.objectStore('awards');
    const body = new Map(
      (await queued(db, tx, 'awards')).flatMap((o) =>
        o.kind === 'putAwards' ? o.body.map((a) => [a.key, a] as const) : [],
      ),
    );
    for (const a of awards) {
      const old = await store.get(a.key);
      const next = {
        key: a.key,
        earnedOn: old && old.earnedOn < a.earnedOn ? old.earnedOn : a.earnedOn,
        seen: !!old?.seen || a.seen,
      };
      await store.put(next);
      body.set(a.key, next);
    }
    await replaceQueued(db, tx, {
      kind: 'putAwards',
      clientId: 'awards',
      body: [...body.values()],
    });
  });

/** Stores a month's challenges (`YYYY-MM`); as on the server, the first keys win, `done` merges, `closed` stays on. */
export const putChallengeMonth = (
  db: Db,
  month: string,
  input: ChallengeMonthPut,
) =>
  local(db, async (tx) => {
    const store = tx.objectStore('challengeMonths');
    const old = await store.get(month);
    const keys = old?.keys ?? input.keys;
    const done: Record<string, string> = { ...old?.done };
    for (const [k, day] of Object.entries(input.done))
      if (keys.includes(k) && !(done[k] && done[k] <= day)) done[k] = day;
    const next: ChallengeMonth = {
      month,
      keys,
      done,
      closed: !!old?.closed || input.closed,
    };
    await store.put(next);
    await replaceQueued(db, tx, {
      kind: 'putChallengeMonth',
      clientId: `challenge:${month}`,
      month,
      body: { keys, done, closed: next.closed } as ChallengeMonthPut,
    });
  });

/**
 * Logs a drink (ADR-0028 §4): the snapshot is built here as on the server, so the day's
 * totals change at once. Resolves to the entry's uuid `clientId`.
 */
export function createDrinkEntry(
  db: Db,
  // Distributive: a plain Omit of the union loses `drinkKey` and `photo`.
  input: DrinkEntryInput extends infer T
    ? T extends unknown
      ? Omit<T, 'clientId'>
      : never
    : never,
) {
  const clientId = crypto.randomUUID();
  const body = { ...input, clientId } as DrinkEntryInput;
  return local(db, async (tx) => {
    let entry: DrinkEntry;
    const base = { clientId, date: body.date, takenAt: body.takenAt };
    if ('photo' in body)
      entry = {
        ...body.photo,
        ...base,
        ml: body.ml,
        drinkKey: null,
        deleted: false,
      };
    else {
      const source = await drinkSource(tx, body.drinkKey);
      if (!source) throw new Error(`unknown drink ${body.drinkKey}`);
      entry = {
        ...entryFrom(source, body.ml),
        ...base,
        drinkKey: body.drinkKey,
        deleted: false,
      };
    }
    await tx.objectStore('drinkEntries').put(entry);
    await tx
      .objectStore('outbox')
      .add({ kind: 'createDrinkEntry', clientId: `drink:${clientId}`, body });
    return clientId;
  });
}

async function drinkSource(tx: Tx, key: string) {
  const builtin = BUILTIN_DRINKS.find((d) => d.key === key);
  if (builtin) return builtin;
  const own = key.startsWith('custom:')
    ? await tx.objectStore('drinks').get(Number(key.slice('custom:'.length)))
    : undefined;
  return own && { ...own, per100: own };
}

/** Removes a drink entry by its uuid; an unsent one just leaves the queue, nothing is sent. */
export const deleteDrinkEntry = (db: Db, clientId: string) =>
  local(db, async (tx) => {
    await tx.objectStore('drinkEntries').delete(clientId);
    const opId = `drink:${clientId}`;
    const outbox = tx.objectStore('outbox');
    // A create being sent is not in `queued`, a sent one may be there already: both need the delete.
    const ops = await queued(db, tx, opId);
    for (const o of ops) await outbox.delete(o.seq!);
    const create = ops.find((o) => o.kind === 'createDrinkEntry');
    if (!create || create.sent)
      await outbox.add({ kind: 'deleteDrinkEntry', clientId: opId });
  });

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
    // Refused and parked ops wait; the rest of the queue goes on.
    let op = (await db.getAll('outbox')).find((o) => !o.error && !o.conflict);
    if (!op) break;
    s.sending = op.seq;
    if (
      (op.kind === 'createMeal' || op.kind === 'createDrinkEntry') &&
      !op.sent
    )
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

/** The server remembers a dish saved with a barcode as the user's product: bring it to this device. */
const remembered = (db: Db, body: Pick<MealPatch, 'items'>) => {
  if (body.items?.some((i) => i.barcode))
    void refreshMyProducts(db).catch(() => {});
};

const mealSchema = z.custom<Meal>();
const putSchema = z.custom<WeighingPutResponse>();
const deleteSchema = z.custom<WeighingDeleteResponse>();
const photoSchema = z.object({ photoId: z.string() });
const awardsSchema = z.custom<{ awards: StoredAward[] }>();
const monthSchema = z.custom<ChallengeMonth>();
const drinkEntrySchema = z.custom<DrinkEntry>();

async function deliver(db: Db, op: Op) {
  switch (op.kind) {
    case 'uploadPhoto':
      return upload(db, op);
    case 'createMeal':
      await saved(
        db,
        op,
        await api('/api/meals', mealSchema, { method: 'POST', body: op.body }),
      );
      return remembered(db, op.body);
    case 'patchMeal':
      await saved(
        db,
        op,
        await api(`/api/meals/${op.id}`, mealSchema, {
          method: 'PATCH',
          body: op.body,
        }),
      );
      return remembered(db, op.body);
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
    case 'putAwards':
      return merged(
        db,
        op,
        'awards',
        (
          await api('/api/awards', awardsSchema, {
            method: 'PUT',
            body: { awards: op.body },
          })
        ).awards,
      );
    case 'putChallengeMonth':
      return merged(db, op, 'challengeMonths', [
        await api(`/api/challenges/${op.month}`, monthSchema, {
          method: 'PUT',
          body: op.body,
        }),
      ]);
    case 'createDrinkEntry':
      return drunk(
        db,
        op,
        await api('/api/drink-entries', drinkEntrySchema, {
          method: 'POST',
          body: op.body,
        }),
      );
    case 'deleteDrinkEntry':
      await api(
        `/api/drink-entries/${op.clientId.slice('drink:'.length)}`,
        z.unknown(),
        { method: 'DELETE' },
      );
      break;
  }
  await db.delete('outbox', op.seq!);
}

/** The server's merge replaces the local copy (its month keys win), unless a newer change waits. */
async function merged<S extends 'awards' | 'challengeMonths'>(
  db: Db,
  op: Op,
  store: S,
  values: OctDb[S]['value'][],
) {
  const tx = db.transaction(['outbox', store], 'readwrite');
  const outbox = tx.objectStore('outbox');
  await outbox.delete(op.seq!);
  if (!(await outbox.index('clientId').count(op.clientId)))
    for (const v of values) await tx.objectStore(store).put(v);
  await tx.done;
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

/**
 * The server's meal: later ops of it learn its id and build on its `editRev`;
 * with none left it replaces the local copy.
 */
async function saved(db: Db, op: Op, meal: Meal) {
  const tx = db.transaction(['outbox', 'meals'], 'readwrite');
  const outbox = tx.objectStore('outbox');
  const meals = tx.objectStore('meals');
  await outbox.delete(op.seq!);
  const later = await outbox.index('clientId').getAll(op.clientId);
  for (const o of later)
    if (o.kind === 'deleteMeal' && !o.id)
      await outbox.put({ ...o, id: meal.id });
    else if (o.kind === 'patchMeal')
      await outbox.put({
        ...o,
        id: o.id || meal.id,
        body: { ...o.body, baseRev: meal.editRev ?? o.body.baseRev },
      });
  const local = await meals.get(op.clientId);
  if (!later.length) await meals.put(meal);
  else if (local)
    await meals.put({ ...local, id: meal.id, editRev: meal.editRev });
  await tx.done;
}

/** The server's entry replaces the local one, unless a later delete of it waits. */
async function drunk(db: Db, op: Op, entry: DrinkEntry) {
  const tx = db.transaction(['outbox', 'drinkEntries'], 'readwrite');
  const outbox = tx.objectStore('outbox');
  await outbox.delete(op.seq!);
  if (!(await outbox.index('clientId').count(op.clientId)))
    await tx.objectStore('drinkEntries').put(entry);
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
  op.kind === 'putPhotoRetention' ||
  // shortcut: a refused award or month keeps its local value until the next full pull; no GET to restore from.
  op.kind === 'putAwards' ||
  op.kind === 'putChallengeMonth';

async function refuse(db: Db, op: Op, err: ApiError) {
  const tx = db.transaction(['outbox', 'meals', 'drinkEntries'], 'readwrite');
  const outbox = tx.objectStore('outbox');
  if (op.kind === 'createDrinkEntry' || op.kind === 'deleteDrinkEntry') {
    // 404: the entry is gone there already, or its own drink was deleted before it went out.
    if (err.status !== 404) await outbox.put({ ...op, error: err.code });
    else {
      await outbox.delete(op.seq!);
      if (op.kind === 'createDrinkEntry')
        await tx.objectStore('drinkEntries').delete(op.body.clientId);
    }
    return tx.done;
  }
  const creates = op.kind === 'createMeal' || op.kind === 'uploadPhoto';
  const here = !!(await tx.objectStore('meals').get(op.clientId));
  // Made on an older version, or deleted there: park it for the user's choice, the local copy stays (ADR-0022 §3).
  if (
    op.kind === 'patchMeal' &&
    (err.code === 'edit_conflict' || (err.status === 404 && here))
  ) {
    const conflict: Conflict =
      err.code === 'edit_conflict'
        ? { kind: 'edit', theirs: (err.details as { meal: Meal }).meal }
        : { kind: 'deleted', deletedAt: Date.now() };
    // Edits made while it was in flight fold in: one parked op per meal.
    let body = op.body;
    for (const o of await outbox.index('clientId').getAll(op.clientId))
      if (o.kind === 'patchMeal' && o.seq !== op.seq) {
        body = { ...body, ...o.body, baseRev: op.body.baseRev } as MealPatch;
        await outbox.delete(o.seq!);
      }
    await outbox.put({ ...op, body, conflict });
    return tx.done;
  }
  // Nothing marks a refused settings or choice op: drop it, restore() takes the server's value back.
  // 404 on an edit or delete: the meal is already gone on the server.
  if (
    notMeal(op) ||
    (err.status === 404 &&
      (op.kind === 'patchMeal' || op.kind === 'deleteMeal'))
  )
    await outbox.delete(op.seq!);
  // A refused create of a meal deleted here: no badge can show it, so drop all its ops.
  else if (creates && !here)
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

export type MealStatus = 'pending' | 'error' | 'conflict' | 'synced';

/** For the meal badge: unsent, refused by the server, waiting for a version choice, or saved there. */
export async function mealStatus(
  db: Db,
  clientId: string,
): Promise<MealStatus> {
  const ops = await db.getAllFromIndex('outbox', 'clientId', clientId);
  if (!ops.length) return 'synced';
  if (ops.some((o) => o.error)) return 'error';
  return ops.some((o) => o.conflict) ? 'conflict' : 'pending';
}

/** Meals waiting for a version choice. */
export const conflictCount = async (db: Db) =>
  (await db.getAll('outbox')).filter((o) => o.conflict).length;

/** The conflict of a meal as the screen shows it; pass it back to the choice. */
export const conflictOf = async (db: Db, clientId: string) =>
  (await db.getAllFromIndex('outbox', 'clientId', clientId)).find(
    (o) => o.conflict,
  )?.conflict ?? null;

/** A stored dish as the API takes it back; `illustration` only when picked by hand, or it freezes. */
const inputItem = (i: MealItem): MealItemInput => ({
  name: i.name,
  grams: i.grams,
  unit: i.unit,
  kcal: i.kcal,
  proteinG: i.proteinG,
  fatG: i.fatG,
  carbsG: i.carbsG,
  source: i.source,
  ...(i.source === 'ai' &&
    i.confidence !== null && { confidence: i.confidence }),
  ...(i.source === 'ai' && i.aiGrams != null && { aiGrams: i.aiGrams }),
  ...(i.source === 'recipe' && i.recipeId && { recipeId: i.recipeId }),
  ...(i.barcode && { barcode: i.barcode }),
  ...(i.illustrationManual && { illustration: i.illustration }),
});

const contentOf = (meal: Meal) => ({
  mealType: meal.mealType,
  eatenAt: meal.eatenAt,
  tzOffsetMin: meal.tzOffsetMin,
  localDate: meal.localDate,
  items: meal.items.map(inputItem),
});

/** `stale`: the conflict changed since it was shown (a pull brought a newer version); nothing is done. */
export type Choice = 'done' | 'stale';

/** One choice: a local transaction and the queue, so it works offline (ADR-0022 §4). */
function choose<K extends Conflict['kind']>(
  db: Db,
  clientId: string,
  shown: Conflict,
  kinds: K[],
  act: (
    tx: Tx,
    op: Op & { kind: 'patchMeal' },
    conflict: Conflict & { kind: K },
    meal: Meal,
  ) => Promise<void>,
) {
  return local(db, async (tx): Promise<Choice> => {
    const op = (await queued(db, tx, clientId)).find((o) => o.conflict);
    const meal = await tx.objectStore('meals').get(clientId);
    const c = op?.conflict;
    if (
      op?.kind !== 'patchMeal' ||
      !c ||
      !meal ||
      !kinds.includes(c.kind as K) ||
      c.kind !== shown.kind ||
      (c.kind === 'edit' &&
        c.theirs.editRev !== (shown as typeof c).theirs.editRev)
    )
      return 'stale';
    await act(tx, op, c as Conflict & { kind: K }, meal);
    return 'done';
  });
}

/** Mine over theirs: the whole local version goes on top of theirs, not the merged patch. */
export const keepMine = (db: Db, clientId: string, shown: Conflict) =>
  choose(db, clientId, shown, ['edit'], async (tx, op, c, meal) => {
    const next: Op = {
      kind: 'patchMeal',
      clientId,
      seq: op.seq,
      id: c.theirs.id,
      body: {
        ...contentOf(meal),
        // Theirs has another photo or none: mine goes with it; the same id changes nothing.
        ...(meal.photo && { photoId: meal.photo.id }),
        editedAt: Date.now(),
        baseRev: c.theirs.editRev,
      },
    };
    await tx.objectStore('outbox').put(next);
  });

/** Theirs replaces the local copy; nothing is sent. */
export const keepTheirs = (db: Db, clientId: string, shown: Conflict) =>
  choose(db, clientId, shown, ['edit'], async (tx, op, c) => {
    await tx.objectStore('meals').put(c.theirs);
    await tx.objectStore('outbox').delete(op.seq!);
  });

/** Deletes the meal; deleted there already, only the local copy goes. */
export const deleteConflicted = (db: Db, clientId: string, shown: Conflict) =>
  choose(db, clientId, shown, ['edit', 'deleted'], (tx) =>
    drop(db, tx, clientId),
  );

/** Deleted there, mine comes back: one createMeal with the same clientId, without the photo. */
export const restoreMine = (db: Db, clientId: string, shown: Conflict) =>
  choose(db, clientId, shown, ['deleted'], async (tx, _op, _c, meal) => {
    const outbox = tx.objectStore('outbox');
    for (const o of await queued(db, tx, clientId)) await outbox.delete(o.seq!);
    await outbox.add({
      kind: 'createMeal',
      clientId,
      body: {
        clientId,
        ...contentOf(meal),
        recalcOffer: meal.recalcOffer,
        // Still logged when it was first saved (ADR-0032 §2).
        ...(meal.loggedAt && { loggedAt: meal.loggedAt }),
      },
    });
    await tx
      .objectStore('meals')
      .put({ ...meal, id: 0, photo: null, editRev: undefined });
  });

/** The code the server refused a meal's first op with; null when none was refused. */
export async function mealError(db: Db, clientId: string) {
  const ops = await db.getAllFromIndex('outbox', 'clientId', clientId);
  return ops.find((o) => o.error)?.error ?? null;
}

/** Unsent changes, refused meal ops included: they are lost on sign-out. Refused settings and choices are dropped. */
export const pendingCount = (db: Db) => db.count('outbox');
