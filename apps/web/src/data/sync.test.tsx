import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { Meal, MeResponse, SyncResponse } from '@oct/shared';
import type { ReactNode } from 'react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';
import { ToastProvider } from '../ui/Toast/Toast';
import { DataProvider, useMeals } from './DataContext';
import { openUserDb, type Db } from './db';
import { patchSettings } from './outbox';
import { pull } from './sync';
import { clearLocal } from './user';

const meal = (clientId: string, localDate = '2026-11-14'): Meal => ({
  id: 1,
  clientId,
  eatenAt: `${localDate}T12:00:00.000Z`,
  tzOffsetMin: 0,
  localDate,
  mealType: 'lunch',
  photo: null,
  recalcOffer: false,
  items: [],
  kcal: 500,
  proteinG: 20,
  fatG: 10,
  carbsG: 60,
});

const page = (p: Partial<SyncResponse>): SyncResponse => ({
  rev: 1,
  more: false,
  meals: [],
  deletedMealClientIds: [],
  ...p,
});

/** Answers /api/sync with `pages` in order and records the requested URLs. */
function serve(...pages: SyncResponse[]) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      return Response.json(pages.shift());
    }),
  );
  return urls;
}

const withApp = (node: ReactNode) => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  return (
    <I18nProvider>
      <ToastProvider>{node}</ToastProvider>
    </I18nProvider>
  );
};

let db: Db;
const open = async () => (db = await openUserDb(7));

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  db?.close();
  await clearLocal(7);
});

describe('pull', () => {
  it('applies meals, settings and illustration choices and stores rev', async () => {
    await open();
    const settings = { locale: 'en', theme: 'dark', units: 'metric' };
    serve(
      page({
        rev: 4,
        meals: [meal('a')],
        settings: settings as SyncResponse['settings'],
        illustrationChoices: [{ nameKey: 'soup', illustration: 'soup' }],
      }),
    );
    await pull(db);
    expect(await db.get('meals', 'a')).toEqual(meal('a'));
    expect(await db.get('kv', 'settings')).toEqual(settings);
    expect(await db.get('kv', 'choices')).toEqual({ soup: 'soup' });
    expect(await db.get('kv', 'rev')).toBe(4);
  });

  it('follows more with since = last rev', async () => {
    await open();
    const urls = serve(
      page({ rev: 500, more: true, meals: [meal('a')] }),
      page({ rev: 501, meals: [meal('b')] }),
    );
    await pull(db);
    expect(urls).toEqual(['/api/sync?since=0', '/api/sync?since=500']);
    expect(await db.getAllKeys('meals')).toEqual(['a', 'b']);
    serve(page({ rev: 501 }));
    await pull(db);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('/api/sync?since=501');
  });

  it('deletes meals and forgets choices reset to automatic', async () => {
    await open();
    serve(
      page({
        rev: 1,
        meals: [meal('a'), meal('b')],
        illustrationChoices: [{ nameKey: 'soup', illustration: 'soup' }],
      }),
      page({
        rev: 2,
        deletedMealClientIds: ['a'],
        illustrationChoices: [{ nameKey: 'soup', illustration: null }],
      }),
    );
    await pull(db);
    await pull(db);
    expect(await db.getAllKeys('meals')).toEqual(['b']);
    expect(await db.get('kv', 'choices')).toEqual({});
  });

  it('keeps a meal with an unsent change, but still applies its deletion', async () => {
    await open();
    const local = { ...meal('a'), kcal: 1 };
    await db.put('meals', local);
    await db.add('outbox', { clientId: 'a', kind: 'deleteMeal', id: 1 });
    serve(
      page({ rev: 1, meals: [meal('a')] }),
      page({ rev: 2, deletedMealClientIds: ['a'] }),
    );
    await pull(db);
    expect(await db.get('meals', 'a')).toEqual(local);
    await pull(db);
    expect(await db.get('meals', 'a')).toBeUndefined();
  });

  it('runs one pull at a time', async () => {
    await open();
    const urls = serve(page({ rev: 1 }));
    await Promise.all([pull(db), pull(db)]);
    expect(urls).toHaveLength(1);
  });
});

describe('useMeals', () => {
  it('shows the day’s meals and re-reads after a pull', async () => {
    const user = { id: 7, email: 'a@example.com' } as MeResponse;
    serve(page({ rev: 1, meals: [meal('a'), meal('b', '2026-11-13')] }));
    function Day() {
      const meals = useMeals('2026-11-14');
      return <p>{meals ? `meals: ${meals.map((m) => m.clientId)}` : '…'}</p>;
    }
    render(
      withApp(
        <DataProvider user={user}>
          <Day />
        </DataProvider>,
      ),
    );
    expect(await screen.findByText('meals: a')).toBeTruthy();

    await open();
    serve(page({ rev: 2, meals: [meal('c')] }));
    await act(() => pull(db));
    expect(await screen.findByText('meals: a,c')).toBeTruthy();
  });
});

describe('network back (OCT-19 2.9)', () => {
  it('sends the queue and says how many entries went', async () => {
    const user = { id: 7, email: 'a@example.com' } as MeResponse;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    render(
      withApp(
        <DataProvider user={user}>
          <p>ready</p>
        </DataProvider>,
      ),
    );
    await screen.findByText('ready');
    await open();
    await patchSettings(db, { theme: 'dark' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('/api/sync')
          ? Response.json(page({}))
          : new Response(null, { status: 204 }),
      ),
    );
    act(() => void window.dispatchEvent(new Event('online')));
    expect(await screen.findByText('Synced 1 entry')).toBeTruthy();
  });
});
