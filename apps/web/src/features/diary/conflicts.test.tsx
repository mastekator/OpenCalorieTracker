import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { sumDay, type Meal, type MeResponse } from '@oct/shared';
import { SessionContext } from '../../app/SessionContext';
import { emitChange } from '../../data/changes';
import { DataProvider, useMeals } from '../../data/DataContext';
import { openUserDb, type Db, type Op } from '../../data/db';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { ConflictProvider } from './conflicts';
import { MealRow } from './MealRow';
import { PendingConflicts } from './PendingConflicts';

const USER = { id: 7, units: 'metric' } as MeResponse;
const A = '00000000-0000-4000-8000-00000000000a';
const DAY = '2026-11-14';

const dish = (name: string, grams: number) =>
  ({
    name,
    grams,
    unit: 'g',
    kcal: grams,
    proteinG: 1,
    fatG: 1,
    carbsG: 1,
  }) as Meal['items'][number];

const meal = (over: Partial<Meal>): Meal => ({
  id: 5,
  clientId: A,
  eatenAt: `${DAY}T19:00:00.000Z`,
  tzOffsetMin: 0,
  localDate: DAY,
  mealType: 'dinner',
  photo: null,
  recalcOffer: false,
  items: [dish('Soup', 300), dish('Bread', 50)],
  kcal: 350,
  proteinG: 2,
  fatG: 2,
  carbsG: 2,
  editRev: 1,
  ...over,
});

const MINE = meal({ items: [dish('Soup', 400), dish('Bread', 50)], kcal: 450 });
const theirs = (editRev: number, grams: number) =>
  meal({
    items: [dish('Soup', grams), dish('Bread', 50), dish('Sour cream', 30)],
    kcal: grams + 80,
    editRev,
  });

const parked = (rev: number, grams: number): Op => ({
  kind: 'patchMeal',
  clientId: A,
  id: 5,
  body: { mealType: 'dinner', editedAt: 1, baseRev: 1 },
  conflict: { kind: 'edit', theirs: theirs(rev, grams) },
});

/** Its kcal from the diary's own meals, as the day totals read them. */
function Day() {
  const meals = useMeals(DAY);
  if (!meals) return null;
  return (
    <>
      <PendingConflicts />
      <p>Total {sumDay(meals).kcal}</p>
      <ul>
        {meals.map((m) => (
          <MealRow key={m.clientId} meal={m} onOpen={() => {}} />
        ))}
      </ul>
    </>
  );
}

// A second connection to the same database, as the queue's own.
let db: Db;

beforeEach(async () => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  // Offline: both choices work without the network (AC-4.9).
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('offline');
    }),
  );
  db = await openUserDb(USER.id);
  await db.put('meals', MINE);
  await db.add('outbox', parked(3, 300));
  render(
    <ToastProvider>
      <I18nProvider>
        <SessionContext
          value={{
            user: USER,
            refresh: async () => {},
            signedIn: async () => {},
            logout: async () => {},
          }}
        >
          <DataProvider user={USER}>
            <ConflictProvider>
              <Day />
            </ConflictProvider>
          </DataProvider>
        </SessionContext>
      </I18nProvider>
    </ToastProvider>,
  );
  await screen.findByText('Total 450');
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  db.close();
  await clearLocal(USER.id);
});

const choose = async () => {
  // The toast's or the strip's: both open the first conflict.
  fireEvent.click(
    (
      await screen.findAllByRole(
        'button',
        { name: 'Choose' },
        { timeout: 2000 },
      )
    )[0]!,
  );
  return screen.findByRole('dialog');
};

/** Changes the parked conflict as a pull would; `announce` lets the screens re-read. */
async function bringTheirs(rev: number, grams: number, announce = true) {
  const op = (await db.getAll('outbox'))[0]!;
  await db.put('outbox', { ...op, conflict: parked(rev, grams).conflict });
  if (announce) await act(async () => emitChange());
}

describe('ConflictProvider', () => {
  it('toasts, shows the badge and both versions, and keeping theirs updates the day', async () => {
    await screen.findByText('An entry was changed on two devices');
    expect(screen.getByText('Choose version')).toBeTruthy();
    const sheet = await choose();
    expect(sheet.textContent).toContain('Dinner, Nov 14');
    const [mine, other] = screen.getAllByRole('region');
    expect(mine!.getAttribute('aria-label')).toMatch(
      /^On this device, .*450 kcal$/,
    );
    expect(other!.textContent).toContain('Sour cream');
    expect(mine!.textContent).toContain('Sour creamnot in this version');
    expect(other!.textContent).toContain('only in this version');
    expect(mine!.textContent).toContain('1 more item unchanged');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Keep this one',
        description: 'On another device',
      }),
    );
    await screen.findByText('Total 380');
    expect(await db.getAll('outbox')).toEqual([]);
    expect(screen.queryByText('Choose version')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    await screen.findByText('Kept the version from the other device');
  });

  it('keeps mine on top of theirs, and a new conflict brings the toast, badge and sheet back', async () => {
    await choose();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Keep this one',
        description: 'On this device',
      }),
    );
    await screen.findByText('Kept the version from this device');
    const [op] = await db.getAll('outbox');
    expect(op).toMatchObject({ body: { baseRev: 3 } });
    expect(op!.conflict).toBeUndefined();
    expect(screen.getByText('Total 450').textContent).toBeTruthy();
    expect(screen.queryByText('Choose version')).toBeNull();

    // The resend meets another edit there: a 409 parks it again (E-6.2).
    await bringTheirs(4, 200);
    await screen.findByText('An entry was changed on two devices');
    fireEvent.click(await screen.findByText('Choose version'));
    expect((await screen.findByRole('dialog')).textContent).toContain(
      '280 kcal',
    );
  });

  it('shows the banner when theirs changes while open, the card showing the new one', async () => {
    await choose();
    expect(screen.queryByText('Check it again and choose.')).toBeNull();
    await bringTheirs(4, 200);
    await screen.findByText('Check it again and choose.');
    const other = screen.getAllByRole('region')[1]!;
    expect(other.textContent).toContain('updated');
    expect(other.textContent).toContain('280 kcal');
  });

  it('does not apply a choice made on a stale version', async () => {
    await choose();
    // A pull changed theirs after the screen drew it.
    await bringTheirs(4, 200, false);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Keep this one',
        description: 'On another device',
      }),
    );
    await screen.findByText('Check it again and choose.');
    expect(screen.getByText('Total 450')).toBeTruthy();
    const [op] = await db.getAll('outbox');
    expect(op!.conflict).toMatchObject({ theirs: { editRev: 4 } });
    expect((await db.get('meals', A))!.kcal).toBe(450);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('the strip counts the conflicts, opens the first and goes once none is left', async () => {
    await screen.findByText('1 entry needs a version choice');
    await choose();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Keep this one',
        description: 'On another device',
      }),
    );
    await screen.findByText('Total 380');
    expect(screen.queryByText(/needs a version choice/)).toBeNull();
  });

  describe('deleted on another device (3.1)', () => {
    beforeEach(async () => {
      const op = (await db.getAll('outbox'))[0]!;
      await db.put('outbox', {
        ...op,
        conflict: { kind: 'deleted', deletedAt: 0 },
      });
      await act(async () => emitChange());
    });

    it('restore queues the meal again and keeps it in the day', async () => {
      const sheet = await choose();
      expect(sheet.textContent).toContain('deleted on another device');
      fireEvent.click(
        screen.getByRole('button', { name: 'Restore my version' }),
      );
      await vi.waitFor(async () =>
        expect(await db.getAll('outbox')).toMatchObject([
          { kind: 'createMeal', body: { clientId: A } },
        ]),
      );
      expect(screen.getByText('Total 450')).toBeTruthy();
      await vi.waitFor(() =>
        expect(screen.queryByText(/needs a version choice/)).toBeNull(),
      );
    });

    it('delete removes the meal and the conflict', async () => {
      await choose();
      fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
      await screen.findByText('Total 0');
      expect(await db.getAll('outbox')).toEqual([]);
      expect(screen.queryByText(/needs a version choice/)).toBeNull();
    });
  });
});
