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
import { pull } from './sync';
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
    void (async () => {
      const d = await openUserDb(user.id);
      if (closed) return d.close();
      open = d;
      await d.put('kv', user, 'me');
      setDb(d);
      try {
        await pull(d);
        if (!closed) await prefetchThumbs(await d.getAll('meals'));
      } catch {
        // Offline or server down: the local copy stays as it is (OCT-77 retries).
      }
    })();
    return () => {
      closed = true;
      open?.close();
    };
  }, [user]);

  if (!db) return null;
  return <DataContext value={db}>{children}</DataContext>;
}

/** Reads from the local database and re-reads after every change; undefined while loading. */
function useLocal<T>(read: (db: Db) => Promise<T>, deps: unknown[]) {
  const db = useContext(DataContext);
  if (!db) throw new Error('data hook outside DataProvider');
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
