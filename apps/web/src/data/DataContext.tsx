import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AccountSettings, Meal, MeResponse } from '@oct/shared';
import { useT } from '../i18n';
import { useToast } from '../ui/Toast/Toast';
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
  const toast = useToast();
  const { t } = useT();
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
