import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  accountSettingsSchema,
  aiStatusSchema,
  effectiveNorm,
  integrationsSchema,
  nameKey,
  type AccountSettings,
  type AiStatus,
  type Drink,
  type DrinkInput,
  type Integrations,
  type Meal,
  type MeResponse,
  type ProfileResponse,
  type DishUnit,
  type Nutrients,
  type Recipe,
  type RecipeInput,
} from '@oct/shared';
import { z } from 'zod';
import { api, ApiError } from '../api/client';
import { applyTheme, savedTheme } from '../app/theme';
import { useT } from '../i18n';
import { useOnline } from '../ui/OfflineBar/OfflineBar';
import { useToast } from '../ui/Toast/Toast';
import { unitOf } from '../ui/weightUnits';
import { useUserId } from '../app/SessionContext';
import { emitChange, onChange } from './changes';
import { openUserDb, type Choices, type Conflict, type Db } from './db';
import {
  flush,
  mealError,
  mealStatus,
  pendingCount,
  type MealStatus,
} from './outbox';
import { refreshMyProducts } from './products';
import { streaks } from './streaks';
import { pull } from './sync';
import { photoIds, prefetchThumbs } from './thumbs';
import { useDeviceAi } from './deviceAi';

/** Exported for stories: a stub database shows queue states without IndexedDB. */
export const DataContext = createContext<Db | null>(null);

/**
 * Opens the signed-in user's database, stores `me` for an offline start and pulls changes.
 * Mount with `key={user.id}`; children render once the database is open.
 */
export function DataProvider({
  user,
  children,
}: {
  user: MeResponse;
  children: ReactNode;
}) {
  const [db, setDb] = useState<Db | null>(null);
  const toast = useToast();
  const { t, locale, setLocale } = useT();
  const synced = useRef<(count: number) => void>(() => {});
  synced.current = (count) => toast({ text: t('sync.sent', { count }) });

  useEffect(() => {
    let open: Db | undefined;
    let closed = false;
    let unlisten = () => {};
    void (async () => {
      const d = await openUserDb(user.id);
      if (closed) return d.close();
      open = d;
      await d.put('kv', user, 'me');
      if (closed) return; // unmounted meanwhile: the cleanup closed it
      setDb(d);
      // Send the queue when the app comes back (ADR-0011 §4); the network coming back is below.
      const onVisible = () =>
        document.visibilityState === 'visible' && void flush(d).catch(() => {});
      document.addEventListener('visibilitychange', onVisible);
      unlisten = () =>
        document.removeEventListener('visibilitychange', onVisible);
      try {
        await flush(d); // pulls at the end
        await sendTimeZone(d).catch(() => {});
        await refreshMyProducts(d).catch(() => {});
        if (!closed)
          await prefetchThumbs(
            photoIds(await d.getAll('meals'), await d.getAll('recipes')),
          );
      } catch {
        // Offline or server down: the local copy stays, flush() retries.
      }
    })();
    return () => {
      closed = true;
      unlisten();
      open?.close();
    };
  }, [user]);

  // The network is back: send the queue, and say so once it is all sent (OCT-19 2.9).
  useEffect(() => {
    if (!db) return;
    let live = true;
    const onOnline = async () => {
      try {
        const before = await pendingCount(db);
        await flush(db);
        if (live && before > 0 && (await pendingCount(db)) === 0)
          synced.current(before);
      } catch {
        // Still offline or closed by a user switch: flush() retries.
      }
    };
    window.addEventListener('online', onOnline);
    return () => {
      live = false;
      window.removeEventListener('online', onOnline);
    };
  }, [db]);

  // Language and theme changed on another device arrive with a pull. Only applied here:
  // writing to the queue would send them back and loop.
  const current = useRef({ locale, setLocale });
  current.current = { locale, setLocale };
  useEffect(() => {
    if (!db) return;
    const apply = () =>
      db.get('kv', 'settings').then(
        (value) => {
          const s = value as AccountSettings | undefined;
          if (!s) return;
          if (s.locale !== current.current.locale)
            current.current.setLocale(s.locale);
          if (s.theme !== savedTheme()) applyTheme(s.theme);
        },
        () => {},
      ); // closed by a user switch
    void apply();
    return onChange(apply);
  }, [db]);

  if (!db) return null;
  return <DataContext value={db}>{children}</DataContext>;
}

/**
 * Tells the server this device's zone when it differs from the saved one, so "today" for tokens
 * follows the user (ADR-0027 §4). Not queued: the next start sends it again.
 */
async function sendTimeZone(db: Db) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const s = (await db.get('kv', 'settings')) as AccountSettings | undefined;
  if (!s || !timeZone || s.timeZone === timeZone) return;
  // Does not move settingsRev, so no pull brings it back: keep the answer locally.
  const saved = await api('/api/account/settings', accountSettingsSchema, {
    method: 'PATCH',
    body: { timeZone },
  });
  await db.put('kv', { ...s, timeZone: saved.timeZone }, 'settings');
}

/** The user's database, for the actions in outbox.ts. */
export function useDb() {
  const db = useContext(DataContext);
  if (!db) throw new Error('data hook outside DataProvider');
  return db;
}

/** The last value each hook read, per database: a remount starts from it, not from empty. */
const lastRead = new WeakMap<Db, Map<string, unknown>>();

/**
 * Reads from the local database and re-reads after every change; undefined while loading.
 * `key`: the hook name and its params, unique across hooks; a remount shows its last read
 * value at once. `optional`: outside DataProvider (stories, view tests) it stays undefined
 * instead of throwing.
 */
function useLocal<T>(
  key: string,
  read: (db: Db) => Promise<T>,
  optional = false,
) {
  const db = useContext(DataContext);
  if (!db && !optional) throw new Error('data hook outside DataProvider');
  const [value, setValue] = useState(() =>
    db ? (lastRead.get(db)?.get(key) as T | undefined) : undefined,
  );
  useEffect(() => {
    if (!db) return;
    let live = true;
    // Reads overlap on bursts of changes: only the latest may land, or a stale one undoes it.
    let latest = 0;
    const load = () => {
      const n = ++latest;
      return read(db).then(
        (v) => {
          if (!live || n !== latest) return;
          let memo = lastRead.get(db);
          if (!memo) lastRead.set(db, (memo = new Map()));
          memo.set(key, v);
          setValue(() => v);
        },
        () => {}, // closed by a user switch
      );
    };
    void load();
    const off = onChange(load);
    return () => {
      live = false;
      off();
    };
  }, [db, key]);
  return value;
}

const byEatenAt = (a: Meal, b: Meal) => a.eatenAt.localeCompare(b.eatenAt);

/** Meals of one day (`YYYY-MM-DD`), by time eaten. */
export const useMeals = (date: string) =>
  useLocal(`meals:${date}`, async (db) =>
    (await db.getAllFromIndex('meals', 'localDate', date)).sort(byEatenAt),
  );

/** Meals from `from` to `to` inclusive, by time eaten. */
export const usePeriod = (from: string, to: string) =>
  useLocal(`period:${from}:${to}`, async (db) =>
    (
      await db.getAllFromIndex(
        'meals',
        'localDate',
        IDBKeyRange.bound(from, to),
      )
    ).sort(byEatenAt),
  );

/** Drink entries from `from` to `to` inclusive: their kcal count in the totals even with the module off (ADR-0028 §5). */
export const useDrinkEntries = (from: string, to: string) =>
  useLocal(`drinkEntries:${from}:${to}`, (db) =>
    db.getAllFromIndex('drinkEntries', 'date', IDBKeyRange.bound(from, to)),
  );

/** Any drink entry in the local copy: the Water card hint shows until the first one (OCT-147 1.6). */
export const useHasDrinkEntries = () =>
  useLocal(
    'hasDrinkEntries',
    async (db) => (await db.count('drinkEntries')) > 0,
  );

/** The user's own drinks in the local copy, any order; sync removes deleted ones (data/sync). */
export const useCustomDrinks = () =>
  useLocal('customDrinks', (db) => db.getAll('drinks'));

/** Water goal history, by `fromDate`. */
export const useWaterGoals = () =>
  useLocal('waterGoals', (db) => db.getAll('waterGoals'));

/** One meal by clientId; null when it is not in the local copy. */
export const useMeal = (clientId: string) =>
  useLocal(
    `meal:${clientId}`,
    async (db) => (await db.get('meals', clientId)) ?? null,
  );

export const useSettings = () =>
  useLocal(
    'settings',
    async (db) =>
      (await db.get('kv', 'settings')) as AccountSettings | undefined,
  );

/**
 * GET /api/ai/status, one request per screen online; offline (or while it loads) the last
 * answer stored on this device. `loading`: online and not answered yet; `ask` false: no request.
 * «AI on this device» off (ADR-0031 §6): no request, and every AI way in reads «not set up».
 */
export function useAiStatus(ask = true) {
  const db = useDb();
  const [deviceAi] = useDeviceAi(useUserId());
  const online = useOnline();
  const stored = useLocal(
    'aiStatus',
    (d) => d.get('kv', 'aiStatus') as Promise<AiStatus | undefined>,
  );
  // null: the request failed.
  const [fresh, setFresh] = useState<AiStatus | null>();
  useEffect(() => {
    if (!online || !ask || !deviceAi) return;
    let live = true;
    api('/api/ai/status', aiStatusSchema).then(
      (s) => {
        if (!live) return;
        setFresh(s);
        db.put('kv', s, 'aiStatus').catch(() => {}); // closed by a user switch
      },
      () => live && setFresh(null),
    );
    return () => {
      live = false;
    };
  }, [db, online, ask, deviceAi]);
  const status = fresh ?? stored;
  if (!deviceAi)
    return {
      status: status && {
        ...status,
        recognition: 'not_configured' as const,
        interview: 'not_configured' as const,
      },
      loading: false,
      off: true,
    };
  return { status, loading: online && fresh === undefined, off: false };
}

/** GET /api/integrations into kv; every useIntegrations re-reads it, so one call refreshes all cards. */
export async function refreshIntegrations(db: Db) {
  const s = await api('/api/integrations', integrationsSchema);
  await db.put('kv', s, 'integrations').catch(() => {}); // closed by a user switch
  emitChange();
  return s;
}

/** GET /api/integrations, kept in kv so offline shows the last known; undefined until either answers. */
export function useIntegrations() {
  const db = useDb();
  const online = useOnline();
  const stored = useLocal(
    'integrations',
    (d) => d.get('kv', 'integrations') as Promise<Integrations | undefined>,
  );
  // Only for when kv can't be written; otherwise `stored` follows every refresh.
  const [fresh, setFresh] = useState<Integrations>();
  useEffect(() => {
    if (!online) return;
    let live = true;
    refreshIntegrations(db).then(
      (s) => live && setFresh(s),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [db, online]);
  return stored ?? fresh;
}

/**
 * Whether the admin forbade outbound requests (ADR-0034 §5). The user's own switch is
 * `settings.offEnabled`; this only reads `blocked`.
 */
export const useOutboundBlocked = () =>
  useIntegrations()?.barcode.blocked ?? false;

/** A profile never saved (what GET /api/profile answers for it). */
export const EMPTY_PROFILE: ProfileResponse = {
  profile: {
    sex: null,
    birthDate: null,
    heightCm: null,
    weightKg: null,
    activity: null,
    goal: null,
    targetWeightKg: null,
    deadline: null,
  },
  manual: null,
  rev: 0,
};

/**
 * Profile and manual norm from the local copy (ADR-0014 §5).
 * Undefined while loading and, online, until the first sync; offline before it — empty.
 */
export function useProfile() {
  const online = useOnline();
  const stored = useLocal('profile', async (db) => {
    const [profile, rev] = await Promise.all([
      db.get('kv', 'profile'),
      db.get('kv', 'rev'),
    ]);
    if (rev === undefined) return null; // never synced
    return (profile as ProfileResponse | undefined) ?? EMPTY_PROFILE;
  });
  if (stored === null) return online ? undefined : EMPTY_PROFILE;
  return stored;
}

/** The norm on `date` (`YYYY-MM-DD`): age moves with it (E-1.2). Null without one, undefined while loading. */
export function useNorm(date: string) {
  const p = useProfile();
  return p && effectiveNorm(p.profile, p.manual, date);
}

/** Remembered illustration per dish nameKey. */
export const useIllustrationChoices = () =>
  useLocal(
    'choices',
    async (db) =>
      ((await db.get('kv', 'choices')) as Choices | undefined) ?? {},
  );

/** Badge of one meal: `pending | error | synced`; none outside DataProvider. */
export const useMealStatus = (clientId: string) =>
  useLocal(`mealStatus:${clientId}`, (db) => mealStatus(db, clientId), true);

/** An edit waiting for a choice: the local meal, when it was edited here, and theirs or the delete. */
export type MealConflict = {
  mine: Meal;
  editedAt?: number;
  conflict: Conflict;
};

/** Edits waiting for a choice against a newer edit or a delete, in queue order. */
export const useConflicts = () =>
  useLocal('conflicts', async (db) => {
    const list: MealConflict[] = [];
    for (const op of await db.getAll('outbox')) {
      const mine = await db.get('meals', op.clientId);
      if (op.conflict && op.kind === 'patchMeal' && mine)
        list.push({ mine, editedAt: op.body.editedAt, conflict: op.conflict });
    }
    return list;
  });

/** The code the server refused the meal with, null when it did not. */
export const useMealError = (clientId: string) =>
  useLocal(`mealError:${clientId}`, (db) => mealError(db, clientId));

/** The weight diary by date ascending, each weighing with its queue state (as a meal badge). */
export const useWeighings = () =>
  useLocal('weighings', async (db) => {
    const [weighings, ops] = await Promise.all([
      db.getAll('weighings'),
      db.getAll('outbox'),
    ]);
    const state = new Map<string, MealStatus>();
    for (const o of ops)
      if (state.get(o.clientId) !== 'error')
        state.set(o.clientId, o.error ? 'error' : 'pending');
    return weighings.map((w) => ({
      ...w,
      status: state.get(`weighing:${w.date}`) ?? ('synced' as MealStatus),
    }));
  });

/** Recently logged first (AC-7.2); never logged ones after them, last edited first. */
export const byLastLogged = (a: Recipe, b: Recipe) =>
  (b.lastLoggedAt ?? '').localeCompare(a.lastLoggedAt ?? '') ||
  b.updatedAt.localeCompare(a.updatedAt);

/** Recipes from the local copy (ADR-0023 §4), recently logged first. */
export const useRecipes = () =>
  useLocal('recipes', async (db) =>
    (await db.getAll('recipes')).sort(byLastLogged),
  );

/** Products kept on this device (ADR-0034 §7) by code: own ones carry `savedAt`. */
export const useProducts = () =>
  useLocal(
    'products',
    async (db) =>
      new Map((await db.getAll('products')).map((p) => [p.code, p])),
  );

/** One recipe; null when it is not in the local copy (deleted, wrong id). */
export const useRecipe = (id: number) =>
  useLocal(`recipe:${id}`, async (db) => (await db.get('recipes', id)) ?? null);

/**
 * DELETE /api/recipes/:id, then out of the local copy. A 404 means it is already gone
 * (another device): drop it too. Any other failure leaves the copy as it is and throws.
 */
export async function deleteRecipe(db: Db, id: number) {
  try {
    await api(`/api/recipes/${id}`, z.unknown(), { method: 'DELETE' });
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  }
  await db.delete('recipes', id);
  emitChange();
}

/** The recipe was saved on another device since the edit started (409). */
export const isRecipeChanged = (err: unknown) =>
  err instanceof ApiError && err.code === 'recipe_changed';

/**
 * POST (new) or PUT (`base`, the version the edit started from) /api/recipes, then the
 * server's recipe into the local copy. A failure throws and leaves the copy as it is;
 * a newer version on the server is pulled first.
 */
export async function saveRecipe(
  db: Db,
  input: RecipeInput,
  base?: Pick<Recipe, 'id' | 'updatedAt'>,
) {
  let recipe: Recipe;
  try {
    recipe = await api(
      base ? `/api/recipes/${base.id}` : '/api/recipes',
      z.custom<Recipe>((v) => typeof (v as Recipe | null)?.id === 'number'),
      base
        ? { method: 'PUT', body: { ...input, updatedAt: base.updatedAt } }
        : { method: 'POST', body: input },
    );
  } catch (err) {
    if (isRecipeChanged(err)) await pull(db).catch(() => {});
    throw err;
  }
  await db.put('recipes', recipe);
  emitChange();
  return recipe;
}

/**
 * POST (new) or PATCH (`id`) /api/drinks, then the server's drink into the local copy.
 * Past entries keep their snapshot (AC-3.10). A failure throws and leaves the copy as it is.
 */
export async function saveDrink(db: Db, input: DrinkInput, id?: number) {
  const drink = await api(
    id === undefined ? '/api/drinks' : `/api/drinks/${id}`,
    z.custom<Drink>((v) => typeof (v as Drink | null)?.id === 'number'),
    { method: id === undefined ? 'POST' : 'PATCH', body: input },
  );
  await db.put('drinks', drink);
  emitChange();
  return drink;
}

/** DELETE /api/drinks/:id, then out of the local copy; a 404 means it is already gone. */
export async function deleteDrink(db: Db, id: number) {
  try {
    await api(`/api/drinks/${id}`, z.unknown(), { method: 'DELETE' });
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  }
  await db.delete('drinks', id);
  emitChange();
}

export type HistoryDish = Nutrients & {
  name: string;
  grams: number;
  unit?: DishUnit;
  eatenAt: string;
};

/**
 * Dishes from the local diary whose name contains `query`, the latest one per name,
 * newest first: «From history» in the ingredient picker (AC-2.2).
 */
export async function findHistoryDishes(db: Db, query: string, limit = 10) {
  const q = nameKey(query);
  // shortcut: reads every local meal per search; add an index if long diaries get slow.
  const meals = (await db.getAll('meals')).sort((a, b) =>
    b.eatenAt.localeCompare(a.eatenAt),
  );
  const found = new Map<string, HistoryDish>();
  for (const m of meals)
    for (const { name, grams, unit, kcal, proteinG, fatG, carbsG } of m.items) {
      const key = nameKey(name);
      if (!q || !grams || found.has(key) || !key.includes(q)) continue;
      found.set(key, {
        name,
        grams,
        ...unitOf(unit),
        kcal,
        proteinG,
        fatG,
        carbsG,
        eatenAt: m.eatenAt,
      });
      if (found.size === limit) return [...found.values()];
    }
  return [...found.values()];
}

/** Streaks, awards and month challenges on `today`; it also grants awards and writes months (ADR-0032 §4). */
export const useStreaks = (today: string) =>
  useLocal(`streaks:${today}`, (db) => streaks(db, today));

/** Unsent changes, for sign-out and account switch. */
export const usePendingCount = () => useLocal('pendingCount', pendingCount);
