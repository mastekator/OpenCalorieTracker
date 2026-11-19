import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  aiStatusSchema,
  effectiveNorm,
  type AccountSettings,
  type AiStatus,
  type Meal,
  type MeResponse,
  type ProfileResponse,
  type Recipe,
} from '@oct/shared';
import { z } from 'zod';
import { api, ApiError } from '../api/client';
import { applyTheme, savedTheme } from '../app/theme';
import { useT } from '../i18n';
import { useOnline } from '../ui/OfflineBar/OfflineBar';
import { useToast } from '../ui/Toast/Toast';
import { emitChange, onChange } from './changes';
import { openUserDb, type Choices, type Db } from './db';
import {
  flush,
  mealError,
  mealStatus,
  pendingCount,
  type MealStatus,
} from './outbox';
import { photoIds, prefetchThumbs } from './thumbs';

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

/** The user's database, for the actions in outbox.ts. */
export function useDb() {
  const db = useContext(DataContext);
  if (!db) throw new Error('data hook outside DataProvider');
  return db;
}

/**
 * Reads from the local database and re-reads after every change; undefined while loading.
 * `optional`: outside DataProvider (stories, view tests) it stays undefined instead of throwing.
 */
function useLocal<T>(
  read: (db: Db) => Promise<T>,
  deps: unknown[],
  optional = false,
) {
  const db = useContext(DataContext);
  if (!db && !optional) throw new Error('data hook outside DataProvider');
  const [value, setValue] = useState<T>();
  useEffect(() => {
    if (!db) return;
    let live = true;
    const load = () =>
      read(db).then(
        (v) => live && setValue(() => v),
        () => {}, // closed by a user switch
      );
    void load();
    const off = onChange(load);
    return () => {
      live = false;
      off();
    };
  }, [db, ...deps]);
  return value;
}

const byEatenAt = (a: Meal, b: Meal) => a.eatenAt.localeCompare(b.eatenAt);

/** Meals of one day (`YYYY-MM-DD`), by time eaten. */
export const useMeals = (date: string) =>
  useLocal(
    async (db) =>
      (await db.getAllFromIndex('meals', 'localDate', date)).sort(byEatenAt),
    [date],
  );

/** Meals from `from` to `to` inclusive, by time eaten. */
export const usePeriod = (from: string, to: string) =>
  useLocal(
    async (db) =>
      (
        await db.getAllFromIndex(
          'meals',
          'localDate',
          IDBKeyRange.bound(from, to),
        )
      ).sort(byEatenAt),
    [from, to],
  );

/** One meal by clientId; null when it is not in the local copy. */
export const useMeal = (clientId: string) =>
  useLocal(async (db) => (await db.get('meals', clientId)) ?? null, [clientId]);

export const useSettings = () =>
  useLocal(
    async (db) =>
      (await db.get('kv', 'settings')) as AccountSettings | undefined,
    [],
  );

/**
 * GET /api/ai/status, one request per screen online; offline (or while it loads) the last
 * answer stored on this device. `loading`: online and not answered yet; `ask` false: no request.
 */
export function useAiStatus(ask = true) {
  const db = useDb();
  const online = useOnline();
  const stored = useLocal(
    (d) => d.get('kv', 'aiStatus') as Promise<AiStatus | undefined>,
    [],
  );
  // null: the request failed.
  const [fresh, setFresh] = useState<AiStatus | null>();
  useEffect(() => {
    if (!online || !ask) return;
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
  }, [db, online, ask]);
  return {
    status: fresh ?? stored,
    loading: online && fresh === undefined,
  };
}

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
  const stored = useLocal(async (db) => {
    const [profile, rev] = await Promise.all([
      db.get('kv', 'profile'),
      db.get('kv', 'rev'),
    ]);
    if (rev === undefined) return null; // never synced
    return (profile as ProfileResponse | undefined) ?? EMPTY_PROFILE;
  }, []);
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
    async (db) =>
      ((await db.get('kv', 'choices')) as Choices | undefined) ?? {},
    [],
  );

/** Badge of one meal: `pending | error | synced`; none outside DataProvider. */
export const useMealStatus = (clientId: string) =>
  useLocal((db) => mealStatus(db, clientId), [clientId], true);

/** The code the server refused the meal with, null when it did not. */
export const useMealError = (clientId: string) =>
  useLocal((db) => mealError(db, clientId), [clientId]);

/** The weight diary by date ascending, each weighing with its queue state (as a meal badge). */
export const useWeighings = () =>
  useLocal(async (db) => {
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
  }, []);

/** Recently logged first (AC-7.2); never logged ones after them, last edited first. */
export const byLastLogged = (a: Recipe, b: Recipe) =>
  (b.lastLoggedAt ?? '').localeCompare(a.lastLoggedAt ?? '') ||
  b.updatedAt.localeCompare(a.updatedAt);

/** Recipes from the local copy (ADR-0023 §4), recently logged first. */
export const useRecipes = () =>
  useLocal(async (db) => (await db.getAll('recipes')).sort(byLastLogged), []);

/** One recipe; null when it is not in the local copy (deleted, wrong id). */
export const useRecipe = (id: number) =>
  useLocal(async (db) => (await db.get('recipes', id)) ?? null, [id]);

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

/** Unsent changes, for sign-out and account switch. */
export const usePendingCount = () => useLocal(pendingCount, []);
