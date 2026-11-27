import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { AccountSettings, DrinkEntry, MeResponse } from '@oct/shared';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { SessionContext } from '../../app/SessionContext';
import { DataProvider } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { TodayScreen } from '../diary/TodayScreen';
import { UndoDeleteProvider } from '../diary/undoDelete';
import { levelY, SPARKS_KEY, WaterCard } from './WaterCard';

const USER = { id: 7 } as MeResponse;
const TODAY = '2026-11-14';

const entry = (over: Partial<DrinkEntry>): DrinkEntry => ({
  clientId: '00000000-0000-4000-8000-0000000000d1',
  date: TODAY,
  takenAt: '2026-11-14T10:00:00.000Z',
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

/** Sync brings nothing; a drink entry POST echoes the entry, DELETE succeeds. */
function serve() {
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith('/api/sync'))
      return Response.json({
        rev: 1,
        more: false,
        meals: [],
        deletedMealClientIds: [],
      });
    if (path === '/api/drink-entries' && init?.method === 'POST')
      return Response.json(
        entry({ ...JSON.parse(init.body as string), kcal: 0 }),
        { status: 201 },
      );
    if (path.startsWith('/api/drink-entries/'))
      return new Response(null, { status: 204 });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function seed(waterEnabled: boolean, entries: DrinkEntry[] = []) {
  const db = await openUserDb(USER.id);
  await db.put(
    'kv',
    { units: 'metric', locale: 'en', waterEnabled } as AccountSettings,
    'settings',
  );
  for (const e of entries) await db.put('drinkEntries', e);
  db.close();
}

function renderToday() {
  render(
    <I18nProvider>
      <ToastProvider>
        <Router hook={memoryLocation({ path: '/' }).hook}>
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
                <TodayScreen />
              </UndoDeleteProvider>
            </DataProvider>
          </SessionContext>
        </Router>
      </ToastProvider>
    </I18nProvider>,
  );
}

const localEntries = async () => {
  const db = await openUserDb(USER.id);
  const all = await db.getAll('drinkEntries');
  db.close();
  return all;
};

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 14, 12));
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.removeItem(SPARKS_KEY);
  await clearLocal(USER.id);
});

describe('Water on Today (OCT-147)', () => {
  it('logs 250 ml with one tap, toasts it, and «Undo» takes it back', async () => {
    const fetch = serve();
    await seed(true);
    renderToday();
    // No entry yet: the hint.
    expect(await screen.findByText('Tap a drink to log 250 ml.')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /^Tea\. Log 250\sml$/ }),
    );

    expect(await screen.findByText('+250 ml · Tea')).toBeTruthy();
    await screen.findByText('of 2,000 ml · 13% of the goal');
    expect((await localEntries()).map((e) => [e.drinkKey, e.ml])).toEqual([
      ['tea', 250],
    ]);
    expect(screen.queryByText('Tap a drink to log 250 ml.')).toBeNull();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/drink-entries',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await screen.findByText('of 2,000 ml · 0% of the goal');
    expect(await localEntries()).toEqual([]);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/drink-entries\//),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('shows kcal drinks as one row among the meals, opening in place (AC-3.5)', async () => {
    serve();
    await seed(true, [
      entry({}),
      entry({
        clientId: '00000000-0000-4000-8000-0000000000d2',
        drinkKey: 'juice',
        illustration: 'drinks',
        kcal: 113,
      }),
    ]);
    renderToday();
    const row = await screen.findByRole('button', { name: /^Drinks/ });
    expect(row.textContent).toContain('Juice');
    expect(row.textContent).toContain('113');
    expect(row.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(row);
    expect(screen.getByText('Juice · 250 ml')).toBeTruthy();
    // Water has no kcal: not in the row.
    expect(screen.queryByText('Water · 250 ml')).toBeNull();
  });

  it('with the module off shows no card and no drinks row, the kcal stay in the total', async () => {
    serve();
    await seed(false, [entry({ drinkKey: 'juice', kcal: 113 })]);
    renderToday();
    await screen.findByText('Nothing logged yet');
    expect(screen.queryByRole('region', { name: 'Water' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Drinks/ })).toBeNull();
    expect(screen.getByText('113')).toBeTruthy();
  });
});

describe('WaterCard', () => {
  const props = {
    today: TODAY,
    goalMl: 2000,
    units: 'metric' as const,
    drinks: [
      {
        key: 'water',
        name: 'Water',
        illustration: 'drinks-water' as const,
        countsWater: true,
      },
    ],
    hint: false,
    onLog: () => {},
  };
  const level = () =>
    screen.getByTestId('water-level').getAttribute('style') ?? '';

  it('fills the glass by the share of the goal, full past it', async () => {
    const view = render(
      <I18nProvider>
        <WaterCard {...props} ml={750} />
      </I18nProvider>,
    );
    expect(
      await screen.findByText('of 2,000 ml · 38% of the goal'),
    ).toBeTruthy();
    expect(level()).toContain(`translateY(${levelY(38)}px)`);
    expect(screen.queryByText('Goal reached')).toBeNull();

    view.rerender(
      <I18nProvider>
        <WaterCard {...props} ml={2600} />
      </I18nProvider>,
    );
    expect(screen.getByText('of 2,000 ml · 130% of the goal')).toBeTruthy();
    expect(level()).toContain(`translateY(${levelY(100)}px)`);
    expect(screen.getByText('Goal reached')).toBeTruthy();
    expect(localStorage.getItem(SPARKS_KEY)).toBe(TODAY);
  });

  it('shows fl oz with US units', async () => {
    render(
      <I18nProvider>
        <WaterCard {...props} ml={750} units="us" />
      </I18nProvider>,
    );
    expect(await screen.findByText('25.4')).toBeTruthy();
    expect(screen.getByText('of 67.6 fl oz · 38% of the goal')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /^Water\. Log 8\.5\sfl oz$/ }),
    ).toBeTruthy();
  });
});
