import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { AccountSettings, Meal, MeResponse } from '@oct/shared';
import { onChange } from './changes';
import { openUserDb, type Choices, type Db } from './db';
import { flush, mealStatus, pendingCount } from './outbox';
import { prefetchThumbs } from './thumbs';

const DataContext = createContext<Db | null>(null);

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
      // Send the queue when the network or the app comes back (ADR-0011 §4).
      const send = () => void flush(d).catch(() => {});
      const onVisible = () => document.visibilityState === 'visible' && send();
      window.addEventListener('online', send);
      document.addEventListener('visibilitychange', onVisible);
      unlisten = () => {
        window.removeEventListener('online', send);
        document.removeEventListener('visibilitychange', onVisible);
      };
      try {
        await flush(d); // pulls at the end
        if (!closed) await prefetchThumbs(await d.getAll('meals'));
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

  if (!db) return null;
  return <DataContext value={db}>{children}</DataContext>;
}

/** The user's database, for the actions in outbox.ts. */
export function useDb() {
  const db = useContext(DataContext);
  if (!db) throw new Error('data hook outside DataProvider');
  return db;
}

/** Reads from the local database and re-reads after every change; undefined while loading. */
function useLocal<T>(read: (db: Db) => Promise<T>, deps: unknown[]) {
  const db = useDb();
  const [value, setValue] = useState<T>();
  useEffect(() => {
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

export const useSettings = () =>
  useLocal(
    async (db) =>
      (await db.get('kv', 'settings')) as AccountSettings | undefined,
    [],
  );

/** Remembered illustration per dish nameKey. */
export const useIllustrationChoices = () =>
  useLocal(
    async (db) =>
      ((await db.get('kv', 'choices')) as Choices | undefined) ?? {},
    [],
  );

/** Badge of one meal: `pending | error | synced`. */
export const useMealStatus = (clientId: string) =>
  useLocal((db) => mealStatus(db, clientId), [clientId]);

/** Unsent changes, for sign-out and account switch. */
export const usePendingCount = () => useLocal(pendingCount, []);
