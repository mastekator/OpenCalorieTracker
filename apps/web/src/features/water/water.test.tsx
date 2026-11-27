import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
import { amountMl } from './AmountSheet';
import { HOLD_MS, levelY, SPARKS_KEY, WaterCard } from './WaterCard';

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

/** Sync brings nothing; a drink entry POST echoes the entry (or fails offline), DELETE succeeds. */
function serve({ offline = false } = {}) {
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (offline && path.startsWith('/api/drink-entries'))
      throw new TypeError('Failed to fetch');
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
  vi.restoreAllMocks();
  localStorage.removeItem(SPARKS_KEY);
  await clearLocal(USER.id);
});

describe('Water on Today (OCT-147)', () => {
  it('logs 250 ml with one tap, toasts it, and «Undo» takes it back', async () => {
    const fetch = serve();
    await seed(true);
    renderToday();
    // No entry yet: the hint.
    expect(
      await screen.findByText(
        'Tap a drink to log 250 ml. Hold to choose the amount.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Tea, add 250\sml$/ }));

    expect(await screen.findByText('+250 ml · Tea')).toBeTruthy();
    await screen.findByText('of 2,000 ml · 13% of the goal');
    expect((await localEntries()).map((e) => [e.drinkKey, e.ml])).toEqual([
      ['tea', 250],
    ]);
    expect(screen.queryByText(/^Tap a drink/)).toBeNull();
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
    const juice = document.querySelector('.drinks-row__entry')!;
    expect(juice.textContent).toContain('·\u00a0250\u00a0ml');
    // Water has no kcal: not in the row.
    expect(juice.parentElement!.textContent).not.toContain('Water');
  });

  it('a hold of 500 ms opens the menu, its click logs nothing; «500 ml» logs 500', async () => {
    serve();
    await seed(true);
    renderToday();
    const tea = await screen.findByRole('button', { name: /^Tea, add/ });
    fireEvent.pointerDown(tea, { button: 0, clientX: 5, clientY: 5 });
    await new Promise((r) => setTimeout(r, HOLD_MS - 200));
    expect(screen.queryByRole('menu')).toBeNull();
    await screen.findByRole('menu', {}, { timeout: 1000 });
    fireEvent.pointerUp(tea);
    fireEvent.click(tea, { detail: 1 });
    expect(await localEntries()).toEqual([]);

    fireEvent.click(screen.getByRole('menuitem', { name: /^500\sml$/ }));
    expect(await screen.findByText('+500 ml · Tea')).toBeTruthy();
    expect((await localEntries()).map((e) => [e.drinkKey, e.ml])).toEqual([
      ['tea', 500],
    ]);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a short tap still logs 250 ml, a move cancels the hold', async () => {
    serve();
    await seed(true);
    renderToday();
    const tea = await screen.findByRole('button', { name: /^Tea, add/ });
    fireEvent.pointerDown(tea, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerMove(tea, { clientX: 40, clientY: 5 });
    await new Promise((r) => setTimeout(r, HOLD_MS + 100));
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.pointerUp(tea);
    fireEvent.click(tea, { detail: 1 });
    expect(await screen.findByText('+250 ml · Tea')).toBeTruthy();
  });

  it('the context menu opens it too; «Other amount» checks the range and logs ml', async () => {
    serve();
    await seed(true);
    renderToday();
    fireEvent.contextMenu(
      await screen.findByRole('button', { name: /^Juice, add/ }),
    );
    // kcal of each amount, per 100 ml in the head.
    expect(screen.getByText('Juice · 45 kcal per 100 ml')).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: /^250\sml 113\skcal$/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Other amount…' }));

    const field = await screen.findByRole('textbox', { name: 'Amount' });
    const add = () => screen.getByRole('button', { name: 'Add' });
    expect(screen.getByText('From 10 ml to 2,000 ml')).toBeTruthy();
    expect(field.getAttribute('aria-invalid')).not.toBe('true');
    expect((add() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: '2500' } });
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect((add() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: '300' } });
    expect(screen.getByText('135 kcal')).toBeTruthy();
    fireEvent.click(add());
    expect(await screen.findByText('+300 ml · Juice · 135 kcal')).toBeTruthy();
    expect((await localEntries()).map((e) => [e.drinkKey, e.ml])).toEqual([
      ['juice', 300],
    ]);
  });

  it('«Hide from the row» hides a built-in; water has no such item', async () => {
    serve();
    await seed(true);
    renderToday();
    fireEvent.contextMenu(
      await screen.findByRole('button', { name: /^Water, add/ }),
    );
    expect(
      screen.queryByRole('menuitem', { name: 'Hide from the row' }),
    ).toBeNull();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    fireEvent.keyDown(screen.getByRole('button', { name: /^Tea, add/ }), {
      key: 'F10',
      shiftKey: true,
    });
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Hide from the row' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Tea, add/ })).toBeNull(),
    );
    const db = await openUserDb(USER.id);
    const settings = (await db.get('kv', 'settings')) as AccountSettings;
    db.close();
    expect(settings.hiddenDrinks).toEqual(['tea']);
  });

  it('«Water today» offline: an unsent entry deletes with «Undo», a sent one cannot', async () => {
    serve({ offline: true });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await seed(true, [entry({})]);
    renderToday();
    fireEvent.click(await screen.findByRole('button', { name: /^Tea, add/ }));
    await screen.findByText('+250 ml · Tea');
    fireEvent.click(screen.getByRole('button', { name: /of 2,000\sml/ }));

    const sheet = await screen.findByRole('dialog', { name: 'Water today' });
    const sent = within(sheet).getByRole('button', {
      name: /^Delete: Water,/,
    });
    expect(sent.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(sent);
    expect(
      within(sheet).getByRole('button', { name: /^Delete: Water,/ }),
    ).toBeTruthy();
    expect(
      within(sheet).getByText(/Entries logged offline can be deleted/),
    ).toBeTruthy();

    const tea = await within(sheet).findByRole('button', {
      name: /^Delete: Tea,/,
    });
    await waitFor(() =>
      expect(within(sheet).getByText('waiting to sync')).toBeTruthy(),
    );
    fireEvent.click(tea);
    await waitFor(() =>
      expect(
        within(sheet).queryByRole('button', { name: /^Delete: Tea,/ }),
      ).toBeNull(),
    );
    expect(await screen.findByText('Deleted')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await within(sheet).findByRole('button', { name: /^Delete: Tea,/ });

    // Delete again and let the window end: the entry leaves the local copy offline.
    fireEvent.click(
      within(sheet).getByRole('button', { name: /^Delete: Tea,/ }),
    );
    await waitFor(() =>
      expect(
        within(sheet).queryByRole('button', { name: /^Delete: Tea,/ }),
      ).toBeNull(),
    );
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(async () =>
      expect((await localEntries()).map((e) => e.drinkKey)).toEqual(['water']),
    );
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

describe('amountMl', () => {
  it('takes 10–2000 ml, fl oz by the shown bounds, always whole ml', () => {
    expect(amountMl('', 'metric')).toBeUndefined();
    expect(amountMl('9', 'metric')).toBeNull();
    expect(amountMl('10', 'metric')).toBe(10);
    expect(amountMl('2000', 'metric')).toBe(2000);
    expect(amountMl('2001', 'metric')).toBeNull();
    expect(amountMl('abc', 'metric')).toBeNull();
    expect(amountMl('10', 'us')).toBe(296);
    expect(amountMl('8,5', 'us')).toBe(251);
    expect(amountMl('0.3', 'us')).toBe(10);
    expect(amountMl('67.6', 'us')).toBe(1999);
    expect(amountMl('0.2', 'us')).toBeNull();
    expect(amountMl('68', 'us')).toBeNull();
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
        per100: { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
      },
    ],
    hint: false,
    onLog: () => {},
    onOther: () => {},
    onHide: () => {},
    onOpenDay: () => {},
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
      screen.getByRole('button', { name: /^Water, add 8\.5\sfl oz$/ }),
    ).toBeTruthy();
  });
});
