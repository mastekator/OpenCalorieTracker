import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import {
  addDays,
  type AccountSettings,
  type DrinkEntry,
  type Meal,
  type MeResponse,
} from '@oct/shared';
import { SessionContext } from '../../app/SessionContext';
import { openUserDb } from '../../data/db';
import { DataProvider } from '../../data/DataContext';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { CaptureProvider } from '../meals/CaptureContext';
import { localToday } from './day';
import { DiaryScreen } from './DiaryScreen';
import { UNDO_MS, UndoDeleteProvider } from './undoDelete';

const today = localToday();
const yesterday = addDays(today, -1);

const meal = (id: number, mealType: Meal['mealType'], hour: number): Meal => ({
  id,
  clientId: `m${id}`,
  eatenAt: `${yesterday}T${String(hour).padStart(2, '0')}:00:00.000Z`,
  tzOffsetMin: 0,
  localDate: yesterday,
  mealType,
  photo: null,
  recalcOffer: false,
  items: [{ name: 'Soup' }] as Meal['items'],
  kcal: 400,
  proteinG: 20,
  fatG: 10,
  carbsG: 50,
});

const USER = { id: 7, email: 'a@example.com' } as MeResponse;

let deletes: string[];

/** /api/sync answers with `meals` once, DELETE with 204; records DELETE urls. */
function serve(meals: Meal[]) {
  deletes = [];
  let first = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        deletes.push(url);
        return new Response(null, { status: 204 });
      }
      if (url === '/api/products/mine') return Response.json({ products: [] });
      const page = {
        rev: 1,
        more: false,
        meals: first ? meals : [],
        deletedMealClientIds: [],
      };
      first = false;
      return Response.json(page);
    }),
  );
}

function setup(path: string, meals: Meal[] = []) {
  serve(meals);
  const location = memoryLocation({ path, record: true });
  const view = render(
    <I18nProvider>
      <ToastProvider>
        <Router hook={location.hook}>
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
                <CaptureProvider>
                  <Route path="/diary/:date">
                    {({ date }) => <DiaryScreen date={date} />}
                  </Route>
                </CaptureProvider>
              </UndoDeleteProvider>
            </DataProvider>
          </SessionContext>
        </Router>
      </ToastProvider>
    </I18nProvider>,
  );
  return { location, ...view };
}

/** The page goes to the background (AC-2.7). */
function hide() {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'hidden',
  });
  document.dispatchEvent(new Event('visibilitychange'));
  delete (document as { visibilityState?: unknown }).visibilityState;
}

const settle = () => new Promise((r) => setTimeout(r, 50));

const deleteButton = (type: string) =>
  screen.findByRole('button', { name: `Delete ${type}` });

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await clearLocal(7);
});

describe('DiaryScreen', () => {
  it('on today «›» is disabled', async () => {
    setup(`/diary/${today}`);
    expect(
      (await screen.findByRole('button', { name: 'Next day' })).hasAttribute(
        'disabled',
      ),
    ).toBe(true);
    expect(await screen.findByText('No entries')).toBeTruthy();
  });

  it('a future or malformed address opens today', async () => {
    const { location } = setup(`/diary/${addDays(today, 1)}`);
    await waitFor(() =>
      expect(location.history.at(-1)).toBe(`/diary/${today}`),
    );
    cleanup();
    const second = setup('/diary/foo');
    await waitFor(() =>
      expect(second.location.history.at(-1)).toBe(`/diary/${today}`),
    );
  });

  it('lists the day early to late under a meal count, ← and → turn the day', async () => {
    const { location } = setup(`/diary/${yesterday}`, [
      meal(2, 'dinner', 19),
      meal(1, 'breakfast', 8),
    ]);
    expect(await screen.findByText('2 meals')).toBeTruthy();
    const rows = screen.getAllByRole('button', { name: /^Delete/ });
    expect(rows.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Delete Breakfast',
      'Delete Dinner',
    ]);
    expect(screen.getByText('800 kcal')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(location.history.at(-1)).toBe(`/diary/${today}`);
  });

  it('«Undo» brings the meal back and sends no DELETE', async () => {
    setup(`/diary/${yesterday}`, [meal(1, 'lunch', 12)]);
    fireEvent.click(await deleteButton('Lunch'));
    expect(screen.queryByRole('button', { name: 'Delete Lunch' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await deleteButton('Lunch')).toBeTruthy();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => vi.advanceTimersByTime(UNDO_MS));
    vi.useRealTimers();
    // Hiding the app does not delete it either.
    hide();
    await settle();
    expect(deletes).toEqual([]);
  });

  it('without «Undo» one DELETE goes after 5 s; hiding and leaving later add none', async () => {
    const { location } = setup(`/diary/${yesterday}`, [meal(1, 'lunch', 12)]);
    const button = await deleteButton('Lunch');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(button);
    act(() => vi.advanceTimersByTime(UNDO_MS - 1));
    expect(deletes).toEqual([]);
    act(() => vi.advanceTimersByTime(1));
    vi.useRealTimers();
    await waitFor(() => expect(deletes).toEqual(['/api/meals/1']));
    hide();
    act(() => location.navigate('/'));
    await settle();
    expect(deletes).toHaveLength(1);
  });

  it('going to the background sends it before the 5 s are up, once', async () => {
    const { location } = setup(`/diary/${yesterday}`, [meal(1, 'lunch', 12)]);
    fireEvent.click(await deleteButton('Lunch'));
    hide();
    await waitFor(() => expect(deletes).toEqual(['/api/meals/1']));
    act(() => location.navigate('/'));
    await settle();
    expect(deletes).toHaveLength(1);
  });

  it('leaving the screen keeps the undo window: one DELETE after 5 s', async () => {
    const { location } = setup(`/diary/${yesterday}`, [meal(1, 'lunch', 12)]);
    const button = await deleteButton('Lunch');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(button);
    act(() => location.navigate('/'));
    expect(deletes).toEqual([]);
    act(() => vi.advanceTimersByTime(UNDO_MS));
    vi.useRealTimers();
    await waitFor(() => expect(deletes).toEqual(['/api/meals/1']));
    hide();
    await settle();
    expect(deletes).toHaveLength(1);
  });

  it('deleting the last meal shows the empty day (E-2.1)', async () => {
    setup(`/diary/${yesterday}`, [meal(1, 'lunch', 12)]);
    fireEvent.click(await deleteButton('Lunch'));
    expect(await screen.findByText('No entries')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Add an entry for this day' }),
    ).toBeTruthy();
  });
});

const drinkEntry = (
  n: number,
  hour: number,
  over: Partial<DrinkEntry> = {},
): DrinkEntry => ({
  clientId: `00000000-0000-4000-8000-00000000000${n}`,
  date: yesterday,
  takenAt: `${yesterday}T${String(hour).padStart(2, '0')}:00:00.000Z`,
  drinkKey: 'water',
  illustration: 'drinks-water',
  ml: 250,
  countsWater: true,
  kcal: 0,
  proteinG: 0,
  fatG: 0,
  carbsG: 0,
  deleted: false,
  ...over,
});

/** Settings, water goals and the day's drink entries in the local copy. */
async function seedWater(waterEnabled: boolean, entries: DrinkEntry[]) {
  const db = await openUserDb(USER.id);
  await db.put(
    'kv',
    { units: 'metric', locale: 'en', waterEnabled } as AccountSettings,
    'settings',
  );
  await db.put('waterGoals', { fromDate: addDays(today, -30), goalMl: 2500 });
  await db.put('waterGoals', { fromDate: today, goalMl: 3000 });
  for (const e of entries) await db.put('drinkEntries', e);
  db.close();
}

const ENTRIES = [
  drinkEntry(1, 12, {
    drinkKey: 'juice',
    illustration: 'drinks',
    ml: 200,
    countsWater: false,
    kcal: 90,
  }),
  // 0 kcal: water only, not in the «Drinks» row.
  drinkEntry(2, 13),
];

describe('DiaryScreen water (OCT-147 4.3–4.4)', () => {
  it('a past day shows its own goal from the history, the line opens its entries', async () => {
    await seedWater(true, ENTRIES);
    setup(`/diary/${yesterday}`);
    const line = await screen.findByRole('button', {
      name: 'Water: 250\u00a0ml of 2,500\u00a0ml',
    });
    fireEvent.click(line);
    const sheet = await screen.findByRole('dialog', { name: /^Water on / });
    expect(sheet.textContent).toContain('Juice');
  });

  it('«Drinks» stands by the last kcal drink among the meals, without 0 kcal ones, and opens', async () => {
    await seedWater(true, ENTRIES);
    setup(`/diary/${yesterday}`, [
      meal(1, 'breakfast', 8),
      meal(2, 'dinner', 18),
    ]);
    const drinks = await screen.findByRole('button', { name: /^Drinks/ });
    const rows = [...document.querySelectorAll('.list__item')];
    expect(rows.findIndex((r) => r.contains(drinks))).toBe(1);
    expect(drinks.textContent).toContain('90');
    expect(drinks.textContent).not.toContain('Water');
    expect(drinks.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(drinks);
    expect(drinks.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelectorAll('.drinks-row__entry')).toHaveLength(1);
  });

  it('with the module off there are no water rows, the drink kcal stay in the total', async () => {
    await seedWater(false, ENTRIES);
    setup(`/diary/${yesterday}`, [meal(1, 'breakfast', 8)]);
    await screen.findByText('490 kcal');
    expect(screen.queryByRole('button', { name: /^Drinks/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Water:/ })).toBeNull();
  });
});
