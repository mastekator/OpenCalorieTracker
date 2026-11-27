import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  drinkRowOrder,
  type AccountSettings,
  type Drink,
  type DrinkEntry,
  type MeResponse,
} from '@oct/shared';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { SessionContext } from '../../app/SessionContext';
import { DataProvider } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { UndoDeleteProvider } from '../diary/undoDelete';
import { DrinksScreen } from './DrinksScreen';

const USER = { id: 7 } as MeResponse;

const BEER: Drink = {
  id: 3,
  name: 'Beer',
  illustration: 'drinks',
  kcal: 43,
  proteinG: 0.5,
  fatG: 0,
  carbsG: 3.6,
  countsWater: false,
  deleted: false,
};
const PAST: DrinkEntry = {
  clientId: '00000000-0000-4000-8000-0000000000d1',
  date: '2026-11-10',
  takenAt: '2026-11-10T18:00:00.000Z',
  drinkKey: 'custom:3',
  name: 'Beer',
  illustration: 'drinks',
  ml: 500,
  countsWater: false,
  kcal: 215,
  proteinG: 2.5,
  fatG: 0,
  carbsG: 18,
  deleted: false,
};

/** Sync brings nothing; drinks and settings echo what they get. */
function serve() {
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    if (path.startsWith('/api/sync'))
      return Response.json({
        rev: 1,
        more: false,
        meals: [],
        deletedMealClientIds: [],
      });
    if (path === '/api/drinks/3' && init?.method === 'PATCH')
      return Response.json({ ...BEER, ...body });
    if (path === '/api/drinks' && init?.method === 'POST')
      return Response.json({ ...body, id: 4, deleted: false }, { status: 201 });
    if (path === '/api/account/settings') return Response.json(body);
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function seed() {
  const db = await openUserDb(USER.id);
  await db.put(
    'kv',
    { units: 'metric', locale: 'en', waterEnabled: true } as AccountSettings,
    'settings',
  );
  await db.put('drinks', BEER);
  await db.put('drinkEntries', PAST);
  db.close();
}

const local = async () => {
  const db = await openUserDb(USER.id);
  const [drinks, entries, settings] = await Promise.all([
    db.getAll('drinks'),
    db.getAll('drinkEntries'),
    db.get('kv', 'settings') as Promise<AccountSettings>,
  ]);
  db.close();
  return { drinks, entries, settings };
};

function renderScreen() {
  render(
    <I18nProvider>
      <ToastProvider>
        <Router hook={memoryLocation({ path: '/settings/drinks' }).hook}>
          <SessionContext
            value={{
              user: USER,
              refresh: async () => {},
              signedIn: async () => {},
              logout: async () => {},
            }}
          >
            <DataProvider user={USER}>
              <UndoDeleteProvider>
                <DrinksScreen />
              </UndoDeleteProvider>
            </DataProvider>
          </SessionContext>
        </Router>
      </ToastProvider>
    </I18nProvider>,
  );
}

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await clearLocal(USER.id);
});

describe('Drinks screen (OCT-147 3.3–3.5)', () => {
  it('changing an own drink keeps the kcal of past entries', async () => {
    const fetch = serve();
    await seed();
    renderScreen();
    fireEvent.click(await screen.findByText('Beer'));
    const kcal = await screen.findByLabelText('Calories');
    fireEvent.change(kcal, { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/drinks/3',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    const patch = fetch.mock.calls.find(([p]) => p === '/api/drinks/3')!;
    expect(JSON.parse(patch[1]!.body as string)).toEqual({
      name: 'Beer',
      illustration: 'drinks',
      countsWater: false,
      kcal: 60,
      proteinG: 0.5,
      fatG: 0,
      carbsG: 3.6,
    });
    await waitFor(async () => expect((await local()).drinks[0]!.kcal).toBe(60));
    expect((await local()).entries).toEqual([PAST]);
  });

  it('a built-in switched off goes to hiddenDrinks and leaves the row', async () => {
    const fetch = serve();
    await seed();
    renderScreen();
    fireEvent.click(await screen.findByRole('switch', { name: 'Tea' }));

    await waitFor(async () =>
      expect((await local()).settings.hiddenDrinks).toEqual(['tea']),
    );
    const { drinks, settings } = await local();
    expect(
      drinkRowOrder({
        entries: [],
        customDrinks: drinks,
        hidden: settings.hiddenDrinks!,
        today: '2026-11-14',
      }),
    ).not.toContain('tea');
    expect(
      (screen.getByRole('switch', { name: 'Water' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    // The queued PATCH goes out before the next test.
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([p]) => p === '/api/account/settings'),
      ).toBe(true),
    );
  });

  it('a new drink: empty macros are 0, an empty name is an error', async () => {
    const fetch = serve();
    await seed();
    renderScreen();
    fireEvent.click(await screen.findByText('Your drink'));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a name')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'My latte' },
    });
    fireEvent.change(screen.getByLabelText('Calories'), {
      target: { value: '62,5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await local()).drinks).toHaveLength(2));
    const post = fetch.mock.calls.find(([p]) => p === '/api/drinks')!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({
      name: 'My latte',
      illustration: 'coffee',
      countsWater: true,
      kcal: 62.5,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
    });
  });

  it('«Delete drink» hides it with «Undo», which brings it back with its id', async () => {
    const fetch = serve();
    await seed();
    renderScreen();
    fireEvent.click(await screen.findByText('Beer'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete drink' }),
    );
    await waitFor(() => expect(screen.queryByText('Beer')).toBeNull());
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Beer')).toBeTruthy();
    expect(fetch.mock.calls.some(([p]) => p === '/api/drinks/3')).toBe(false);
    expect((await local()).drinks).toEqual([BEER]);
  });

  it('offline: saving an own drink is unavailable, with the reason', async () => {
    serve();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await seed();
    renderScreen();
    fireEvent.click(await screen.findByText('Beer'));
    const save = (await screen.findByRole('button', {
      name: 'Save',
    })) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(
      screen.getByText(
        'Without a connection you can log drinks, but not create or change them.',
      ),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Delete drink',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
