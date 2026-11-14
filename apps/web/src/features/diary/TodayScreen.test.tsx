import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { Meal, MeResponse, ProfileResponse } from '@oct/shared';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { emitChange } from '../../data/changes';
import { DataProvider } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { TodayScreen } from './TodayScreen';
import { useToday } from './useToday';

const USER = { id: 7 } as MeResponse;

const meal = (clientId: string, localDate: string, hour: number): Meal => ({
  id: 1,
  clientId,
  eatenAt: `${localDate}T${String(hour).padStart(2, '0')}:00:00.000Z`,
  tzOffsetMin: 0,
  localDate,
  mealType: 'lunch',
  photo: null,
  recalcOffer: false,
  items: [{ name: `Dish ${clientId}` }] as Meal['items'],
  kcal: 500,
  proteinG: 20,
  fatG: 10,
  carbsG: 60,
});

const EMPTY_PROFILE = {
  sex: null,
  birthDate: null,
  heightCm: null,
  weightKg: null,
  activity: null,
  goal: null,
  targetWeightKg: null,
  deadline: null,
};
const profile = (kcal: number | null): ProfileResponse =>
  ({
    profile: EMPTY_PROFILE,
    manual: kcal && { kcal, proteinPct: 30, fatPct: 30, carbsPct: 40 },
    rev: 1,
  }) as ProfileResponse;

/** /api/profile answers with `answer` (null → 500), sync with nothing new. */
function serve(answer: ProfileResponse | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      if (path === '/api/profile')
        return answer
          ? Response.json(answer)
          : Response.json({ error: { code: 'internal' } }, { status: 500 });
      if (path.startsWith('/api/sync'))
        return Response.json({
          rev: 0,
          more: false,
          meals: [],
          deletedMealClientIds: [],
        });
      return new Response(null, { status: 404 });
    }),
  );
}

async function seed(...meals: Meal[]) {
  const db = await openUserDb(USER.id);
  for (const m of meals) await db.put('meals', m);
  db.close();
}

function renderToday() {
  const location = memoryLocation({ path: '/', record: true });
  render(
    <I18nProvider>
      <Router hook={location.hook}>
        <DataProvider user={USER}>
          <TodayScreen />
        </DataProvider>
      </Router>
    </I18nProvider>,
  );
  return location;
}

const mealNames = () =>
  screen
    .queryAllByText(/^Dish /)
    .map((el) => el.textContent?.replace('Dish ', ''));

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  // Only Date: IndexedDB and React need real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 14, 12)); // Saturday
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await clearLocal(USER.id);
});

describe('TodayScreen', () => {
  it('without a norm shows «Eaten today» and the invite to set one (AC-1.10)', async () => {
    serve(profile(null));
    await seed(meal('a', '2026-11-14', 9));
    renderToday();
    expect(await screen.findByText('Eaten today')).toBeTruthy();
    expect(
      screen.getByText('Set a daily goal to see what’s left'),
    ).toBeTruthy();
    expect(screen.queryByText(/this week/)).toBeNull();
  });

  it('shows the empty state on a day without meals (AC-1.11)', async () => {
    serve(profile(2000));
    renderToday();
    expect(await screen.findByText('Nothing logged yet')).toBeTruthy();
    expect(screen.getByText('Left')).toBeTruthy();
    expect(screen.getByText('2,000')).toBeTruthy();
  });

  it('lists today’s meals newest first, with the week line (AC-1.7, AC-3.9)', async () => {
    serve(profile(2000));
    await seed(
      meal('breakfast', '2026-11-14', 7),
      meal('dinner', '2026-11-14', 18),
      meal('lunch', '2026-11-14', 12),
      meal('yesterday', '2026-11-13', 12),
    );
    renderToday();
    await screen.findByText('Dish dinner');
    expect(mealNames()).toEqual(['dinner', 'lunch', 'breakfast']);
    // 2000 × 7 − 4 × 500
    expect(screen.getByText('12,000 kcal left this week')).toBeTruthy();
  });

  it('moves to the new day when the app comes back after midnight (AC-1.12)', async () => {
    serve(profile(2000));
    await seed(meal('sat', '2026-11-14', 9), meal('sun', '2026-11-15', 9));
    renderToday();
    await screen.findByText('Dish sat');
    expect(screen.getByText('Saturday, November 14')).toBeTruthy();

    vi.setSystemTime(new Date(2026, 10, 15, 0, 5));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByText('Dish sun')).toBeTruthy();
    expect(screen.queryByText('Dish sat')).toBeNull();
    expect(screen.getByText('Sunday, November 15')).toBeTruthy();
  });

  it('updates without a reload when the local copy changes (AC-1.3)', async () => {
    serve(profile(2000));
    renderToday();
    await screen.findByText('Nothing logged yet');
    await seed(meal('new', '2026-11-14', 13));
    act(emitChange);
    expect(await screen.findByText('Dish new')).toBeTruthy();
    expect(screen.queryByText('Nothing logged yet')).toBeNull();
  });

  it('keeps the meals when only the norm failed to load, with a retry (2.7)', async () => {
    serve(null);
    await seed(meal('a', '2026-11-14', 9));
    renderToday();
    expect(await screen.findByText('Couldn’t load this day')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(await screen.findByText('Dish a')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'From library' })).toBeTruthy();
  });

  it('shows only the error, not the empty state, when nothing loaded (2.7)', async () => {
    serve(null);
    renderToday();
    await screen.findByText('Couldn’t load this day');
    expect(screen.queryByText('Nothing logged yet')).toBeNull();
  });
});

describe('useToday', () => {
  function Today() {
    return <p>{useToday()}</p>;
  }

  it('moves on at local midnight by itself', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14, 23, 59, 30));
    render(<Today />);
    expect(screen.getByText('2026-11-14')).toBeTruthy();
    act(() => vi.advanceTimersByTime(29_000));
    expect(screen.getByText('2026-11-14')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText('2026-11-15')).toBeTruthy();
    // and the next night too
    act(() => vi.advanceTimersByTime(24 * 3_600_000));
    expect(screen.getByText('2026-11-16')).toBeTruthy();
  });
});
