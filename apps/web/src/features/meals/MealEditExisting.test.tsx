import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Route, Router, Switch, useLocation } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import {
  addDays,
  type Meal,
  type MealPatch,
  type MeResponse,
} from '@oct/shared';
import { DataProvider } from '../../data/DataContext';
import { openUserDb, type Op } from '../../data/db';
import { clearLocal } from '../../data/user';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { isDirty } from '../../app/dirty';
import { LeaveGuard } from '../../app/LeaveGuard';
import { SessionContext } from '../../app/SessionContext';
import { ToastProvider } from '../../ui/Toast/Toast';
import { localToday } from '../diary/day';
import { UNDO_MS, UndoDeleteProvider } from '../diary/undoDelete';
import type { RecipeEditorState } from '../kitchen/RecipeEditor';
import {
  MealEditExisting,
  MealEditRoute,
  MealEditScreen,
  MealRecalc,
} from './MealEditScreen';
import { MEAL_EDIT_PATH } from './RecognitionScreen';

// jsdom has no canvas: the photo is taken as is.
vi.mock('./prepareImage', async (original) => ({
  ...(await original<typeof import('./prepareImage')>()),
  prepareImage: async (file: Blob) => file,
}));

type Patch = Omit<MealPatch, 'editedAt'> | null;

const saved = (over: Partial<Meal> = {}): Meal => ({
  id: 5,
  clientId: 'm5',
  eatenAt: new Date(2026, 10, 12, 19, 55).toISOString(),
  tzOffsetMin: -new Date(2026, 10, 12, 19, 55).getTimezoneOffset(),
  localDate: '2026-11-12',
  mealType: 'dinner',
  photo: null,
  recalcOffer: false,
  // Stored values that no AI answer gave: the recalculation must start from them (AC-2.8).
  items: [
    {
      name: 'Buckwheat',
      grams: 200,
      unit: 'g',
      kcal: 250,
      proteinG: 10,
      fatG: 4,
      carbsG: 50,
      source: 'manual',
      aiProvider: null,
      aiModel: null,
      confidence: null,
      recipeId: null,
      barcode: null,
      illustration: 'grains',
      illustrationManual: false,
    },
  ],
  kcal: 250,
  proteinG: 10,
  fatG: 4,
  carbsG: 50,
  ...over,
});

const button = (name: string) => screen.getByRole('button', { name });
const dialog = () => screen.queryByRole('alertdialog');
const when = () => screen.getByLabelText('Date and time') as HTMLInputElement;
const weight = () =>
  screen.getByRole('textbox', { name: 'Weight of Buckwheat' });

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('MealEditScreen: a saved meal (OCT-19 §3.1)', () => {
  const PATH = '/meal/m5';

  function Flow({
    onPatch,
    onDelete,
    onRecipe,
  }: {
    onPatch: (patch: Patch) => void;
    onDelete: () => void;
    onRecipe: (state: RecipeEditorState) => void;
  }) {
    const [path, navigate] = useLocation();
    if (path !== PATH) return <p>Day page</p>;
    return (
      <MealEditScreen
        meal={saved()}
        dishes={[]}
        units="metric"
        now={() => new Date(2026, 10, 15, 13, 24)}
        onSave={async () => {}}
        onPatch={async (patch) => {
          onPatch(patch);
          navigate('/', { replace: true });
        }}
        onDelete={onDelete}
        onClose={() => navigate('/')}
        onRecipe={onRecipe}
      />
    );
  }

  async function setup() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([null])),
    );
    history.replaceState(null, '', '/');
    history.pushState(null, '', PATH);
    const onPatch = vi.fn<(patch: Patch) => void>();
    const onDelete = vi.fn();
    const onRecipe = vi.fn<(state: RecipeEditorState) => void>();
    await renderLoaded(
      <I18nProvider>
        <ToastProvider>
          <LeaveGuard>
            <Flow onPatch={onPatch} onDelete={onDelete} onRecipe={onRecipe} />
          </LeaveGuard>
        </ToastProvider>
      </I18nProvider>,
    );
    return { onPatch, onDelete, onRecipe };
  }

  it('shows type and date in the title, the time eaten, no future (AC-2.9)', async () => {
    await setup();
    expect(
      screen.getByRole('heading', { name: 'Dinner, Nov 12' }),
    ).toBeTruthy();
    expect(when().value).toBe('2026-11-12T19:55');
    // Shown in the app's language, not the browser's (OCT-19 §3.1).
    expect(screen.getByText(/^Thu, Nov 12, 7:55/)).toBeTruthy();
    expect(when().max).toBe('2026-11-15T13:24');
    fireEvent.change(when(), { target: { value: '2026-11-20T10:00' } });
    expect(when().value).toBe('2026-11-15T13:24');
  });

  it('«⋯» → «Save as recipe» opens the editor with the dishes on screen (AC-6.2)', async () => {
    const { onRecipe } = await setup();
    fireEvent.change(weight(), { target: { value: '400' } });
    fireEvent.click(button('Meal actions'));
    fireEvent.click(await screen.findByText('Save as recipe'));
    expect(onRecipe).toHaveBeenCalledOnce();
    expect(onRecipe.mock.calls[0]![0]).toMatchObject({
      draft: {
        name: 'Buckwheat',
        ingredients: [
          { name: 'Buckwheat', grams: 400, kcal: 500, source: 'history' },
        ],
      },
      fromMeal: { mealType: 'dinner', localDate: '2026-11-12' },
    });
  });

  it('a weight edit counts from the stored values (AC-2.8)', async () => {
    const { onPatch } = await setup();
    fireEvent.change(weight(), { target: { value: '400' } });
    expect(document.querySelector('.meal-edit__kcal')!.textContent).toBe(
      '500 kcal',
    );
    await act(async () => fireEvent.click(button('Save')));
    const patch = onPatch.mock.calls[0]![0]!;
    expect(patch.items?.[0]).toMatchObject({
      grams: 400,
      kcal: 500,
      source: 'manual',
    });
    // Only what changed goes out.
    expect(Object.keys(patch)).toEqual(['items']);
  });

  it('a new date sends eatenAt, the offset at that moment and its localDate', async () => {
    const tz = process.env.TZ;
    process.env.TZ = 'Europe/Berlin'; // CET in November, CEST in October
    try {
      const { onPatch } = await setup();
      fireEvent.change(when(), { target: { value: '2026-10-20T10:00' } });
      await act(async () => fireEvent.click(button('Save')));
      expect(onPatch).toHaveBeenCalledWith({
        eatenAt: '2026-10-20T08:00:00.000Z',
        tzOffsetMin: 120,
        localDate: '2026-10-20',
      });
    } finally {
      // Assigning undefined would store the string "undefined", which Node reads as UTC.
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });

  it('Save without edits queues nothing', async () => {
    const { onPatch } = await setup();
    await act(async () => fireEvent.click(button('Save')));
    expect(onPatch).toHaveBeenCalledWith(null);
  });

  it('leaving without edits asks nothing (AC-2.10)', async () => {
    await setup();
    fireEvent.click(button('Close'));
    expect(dialog()).toBeNull();
    expect(screen.getByText('Day page')).toBeTruthy();
  });

  it('leaving with edits asks «Save changes?»', async () => {
    const { onPatch } = await setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Lunch' }));
    fireEvent.click(button('Close'));
    expect(dialog()!.textContent).toContain('Save changes?');
    expect(dialog()!.textContent).toContain(
      'Otherwise your edits to this entry will be lost.',
    );
    await act(async () => fireEvent.click(button('Save and leave')));
    expect(onPatch).toHaveBeenCalledWith({ mealType: 'lunch' });
    expect(screen.getByText('Day page')).toBeTruthy();
  });

  it('Save and leave with an invalid weight stays (E-0.4)', async () => {
    const { onPatch } = await setup();
    fireEvent.change(weight(), { target: { value: '0' } });
    fireEvent.click(button('Close'));
    await act(async () => fireEvent.click(button('Save and leave')));
    expect(onPatch).not.toHaveBeenCalled();
    expect(location.pathname).toBe(PATH);
  });

  it('«Delete entry» under Save; with every dish deleted it replaces Save (E-2.3)', async () => {
    const { onDelete } = await setup();
    expect(button('Save')).toBeTruthy();
    fireEvent.click(button('Delete Buckwheat'));
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(
      screen.getAllByRole('button', { name: 'Delete entry' }),
    ).toHaveLength(1);
    fireEvent.click(button('Delete entry'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('MealEditExisting (/meal/:clientId)', () => {
  const today = localToday();
  const yesterday = addDays(today, -1);
  let sent: { method: string; url: string; body?: unknown }[];

  function setup(meal: Meal, path = `/meal/${meal.clientId}`) {
    sent = [];
    let first = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.startsWith('/api/meals')) {
          sent.push({
            method,
            url,
            body: init?.body && JSON.parse(String(init.body)),
          });
          return method === 'DELETE'
            ? new Response(null, { status: 204 })
            : Response.json(meal);
        }
        if (url === '/api/dishes/previous') return Response.json([null]);
        // A barcode dish of the previous test refreshes these in the background.
        if (url === '/api/products/mine')
          return Response.json({ products: [] });
        if (!url.startsWith('/api/sync')) {
          throw new Error(`unexpected fetch ${method} ${url}`);
        }
        const page = {
          rev: 1,
          more: false,
          meals: first ? [meal] : [],
          deletedMealClientIds: [],
        };
        first = false;
        return Response.json(page);
      }),
    );
    const at = memoryLocation({ path, record: true });
    render(
      <I18nProvider>
        <ToastProvider>
          <Router hook={at.hook}>
            <SessionContext
              value={{
                user: null,
                refresh: async () => {},
                signedIn: async () => {},
                logout: async () => {},
              }}
            >
              <DataProvider
                user={{ id: 9, email: 'a@example.com' } as MeResponse}
              >
                <UndoDeleteProvider>
                  <Switch>
                    <Route path={MEAL_EDIT_PATH}>
                      <MealEditRoute />
                    </Route>
                    <Route path="/meal/:clientId">
                      {({ clientId }) => (
                        <MealEditExisting clientId={clientId} />
                      )}
                    </Route>
                    <Route path="/diary/:date">
                      {({ date }) => <p>Diary {date}</p>}
                    </Route>
                    <Route>
                      <p>Today page</p>
                    </Route>
                  </Switch>
                </UndoDeleteProvider>
              </DataProvider>
            </SessionContext>
          </Router>
        </ToastProvider>
      </I18nProvider>,
    );
    return at;
  }

  afterEach(() => clearLocal(9));

  const onYesterday = () =>
    saved({
      eatenAt: new Date(`${yesterday}T19:55`).toISOString(),
      localDate: yesterday,
    });

  /** The meal in the local copy with its ops refused by the server. */
  async function refused(meal: Meal, ...ops: Op[]) {
    const db = await openUserDb(9);
    await db.put('meals', meal);
    for (const op of ops) await db.add('outbox', op);
    db.close();
  }

  it('a refused meal says so; Save without edits sends it again (OCT-206)', async () => {
    const meal = onYesterday();
    const { clientId, eatenAt, tzOffsetMin, localDate, mealType } = meal;
    await refused(meal, {
      kind: 'createMeal',
      clientId,
      body: { clientId, eatenAt, tzOffsetMin, localDate, mealType, items: [] },
      sent: true,
      error: 'validation_failed',
    });
    setup(meal);
    expect(
      await screen.findByText('The server didn’t accept this entry'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Check the date and time, then save again or delete the entry.',
      ),
    ).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Save' })),
    );
    await waitFor(() =>
      expect(sent).toMatchObject([{ method: 'POST', url: '/api/meals' }]),
    );
  });

  it('a refused photo has its own text', async () => {
    const meal = onYesterday();
    await refused(meal, {
      kind: 'uploadPhoto',
      clientId: meal.clientId,
      error: 'photo_invalid',
    });
    setup(meal);
    expect(
      await screen.findByText(
        'The server couldn’t use the photo. Save again to keep the entry without it.',
      ),
    ).toBeTruthy();
  });

  it('a move stays on the original day with «Moved to … · Open» (6.7)', async () => {
    const at = setup(onYesterday());
    const field = await screen.findByLabelText('Date and time');
    const twoAgo = addDays(yesterday, -1);
    fireEvent.change(field, { target: { value: `${twoAgo}T12:00` } });
    fireEvent.click(button('Save'));
    await waitFor(() => expect(at.history.at(-1)).toBe(`/diary/${yesterday}`));
    expect(await screen.findByText(/^Moved to /)).toBeTruthy();
    await waitFor(() =>
      expect(sent).toContainEqual(
        expect.objectContaining({ method: 'PATCH', url: '/api/meals/5' }),
      ),
    );
    expect(
      (
        sent.find((r) => r.method === 'PATCH')!.body as MealPatch & {
          localDate: string;
        }
      ).localDate,
    ).toBe(twoAgo);
    fireEvent.click(button('Open'));
    expect(at.history.at(-1)).toBe(`/diary/${twoAgo}`);
  });

  describe('«Saved for next time» (OCT-313 2.2, AC-4.5)', () => {
    const label = {
      ...saved().items[0]!,
      source: 'label' as const,
      barcode: '96385074',
    };
    const toast = () => screen.queryByText('Saved “Buckwheat” for next time');

    it('a new meal with a label dish says so on Today', async () => {
      history.replaceState({ dishes: [label] }, '');
      const at = setup(saved(), MEAL_EDIT_PATH);
      fireEvent.click(
        await screen.findByRole('button', { name: 'Save' }, { timeout: 5000 }),
      );
      await waitFor(() => expect(at.history.at(-1)).toBe('/'));
      await screen.findByText('Saved “Buckwheat” for next time');
      history.replaceState(null, '');
      // The queue sends it before the next test clears the local copy.
      await waitFor(() =>
        expect(sent).toContainEqual(
          expect.objectContaining({ method: 'POST', url: '/api/meals' }),
        ),
      );
    });

    it('an edit of a saved meal says nothing', async () => {
      setup(saved({ items: [label] }));
      fireEvent.change(
        await screen.findByRole(
          'textbox',
          { name: 'Weight of Buckwheat' },
          { timeout: 5000 },
        ),
        { target: { value: '300' } },
      );
      fireEvent.click(button('Save'));
      await screen.findByText('Diary 2026-11-12');
      await waitFor(() =>
        expect(sent).toContainEqual(
          expect.objectContaining({ method: 'PATCH', url: '/api/meals/5' }),
        ),
      );
      expect(toast()).toBeNull();
    });
  });

  it('«Delete entry» goes back to the day, one DELETE after the undo window', async () => {
    const at = setup(onYesterday());
    const del = await screen.findByRole(
      'button',
      { name: 'Delete entry' },
      { timeout: 5000 },
    );
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(del);
    expect(at.history.at(-1)).toBe(`/diary/${yesterday}`);
    act(() => vi.advanceTimersByTime(UNDO_MS - 1));
    expect(screen.getByText('Dinner deleted')).toBeTruthy();
    expect(sent).toEqual([]);
    act(() => vi.advanceTimersByTime(1));
    vi.useRealTimers();
    await waitFor(() =>
      expect(sent).toEqual([
        expect.objectContaining({ method: 'DELETE', url: '/api/meals/5' }),
      ]),
    );
  });

  it('a meal not in the local copy opens Today', async () => {
    const at = setup(onYesterday());
    act(() => at.navigate('/meal/unknown'));
    await waitFor(() => expect(at.history.at(-1)).toBe('/'));
  });
});

describe('recalculation from the photo (OCT-62)', () => {
  const yesterday = addDays(localToday(), -1);
  let sent: { method: string; url: string; body?: unknown }[];
  let statusCalls: number;

  const withPhoto = (over: Partial<Meal> = {}) =>
    saved({
      eatenAt: new Date(`${yesterday}T19:55`).toISOString(),
      localDate: yesterday,
      photo: { id: 'p1', full: true },
      recalcOffer: true,
      ...over,
    });

  async function setup(
    meal: Meal,
    {
      recognition = 'ready',
      recognize = () => Response.json({ dishes: [porridge] }),
      refine = () =>
        Response.json({ error: { code: 'ai_no_vision' } }, { status: 409 }),
      upload = (): Response | Promise<Response> =>
        Response.json({ photoId: 'p1' }, { status: 201 }),
    } = {},
  ) {
    sent = [];
    statusCalls = 0;
    let first = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.startsWith('/api/meals')) {
          const body = init?.body && JSON.parse(String(init.body));
          sent.push({ method, url, body });
          // The offer as sent: the local copy keeps «Not now».
          return Response.json({ ...meal, recalcOffer: !!body?.recalcOffer });
        }
        if (url === '/api/ai/status') {
          statusCalls++;
          return Response.json({
            recognition,
            interview: 'ready',
            providerName: null,
            baseUrlHost: null,
            refineLimit: null,
          });
        }
        if (url === '/api/photos') return upload();
        if (url === '/api/photos/p1/recognize') return recognize();
        if (url === '/api/ai/refine') return refine();
        if (url === '/api/dishes/previous') return Response.json([null]);
        // A barcode dish of the previous test refreshes these in the background.
        if (url === '/api/products/mine')
          return Response.json({ products: [] });
        if (!url.startsWith('/api/sync')) {
          throw new Error(`unexpected fetch ${method} ${url}`);
        }
        const page = {
          rev: 1,
          more: false,
          meals: first ? [meal] : [],
          deletedMealClientIds: [],
        };
        first = false;
        return Response.json(page);
      }),
    );
    history.replaceState(null, '', `/diary/${yesterday}`);
    history.pushState(null, '', `/meal/${meal.clientId}`);
    await renderLoaded(
      <I18nProvider>
        <ToastProvider>
          <LeaveGuard>
            <SessionContext
              value={{
                user: null,
                refresh: async () => {},
                signedIn: async () => {},
                logout: async () => {},
              }}
            >
              <DataProvider
                user={{ id: 9, email: 'a@example.com' } as MeResponse}
              >
                <UndoDeleteProvider>
                  <Switch>
                    <Route path="/meal/:clientId">
                      {({ clientId }) => (
                        <MealEditExisting clientId={clientId} />
                      )}
                    </Route>
                    <Route path="/meal/:clientId/recalc">
                      {({ clientId }) => <MealRecalc clientId={clientId} />}
                    </Route>
                    <Route>
                      <p>Day page</p>
                    </Route>
                  </Switch>
                </UndoDeleteProvider>
              </DataProvider>
            </SessionContext>
          </LeaveGuard>
        </ToastProvider>
      </I18nProvider>,
    );
    await screen.findByLabelText('Date and time');
    // Asked for every meal: «Refine» works without a photo (AC-4.2).
    await waitFor(() => expect(statusCalls).toBe(1));
    await act(async () => {}); // the status answer renders
  }

  const porridge = {
    name: 'Porridge',
    grams: 300,
    kcal: 330,
    proteinG: 9,
    fatG: 6,
    carbsG: 60,
    confidence: 0.9,
  };
  const recalcButton = () =>
    screen.queryByRole('button', { name: 'Recalculate from photo' });
  const banner = () => screen.queryByText('AI is back');

  afterEach(() => clearLocal(9));

  it('no action without AI or without the full photo (AC-10.7)', async () => {
    await setup(withPhoto(), { recognition: 'not_configured' });
    expect(banner()).toBeNull();
    expect(recalcButton()).toBeNull();
    cleanup();
    await clearLocal(9);
    await setup(withPhoto({ photo: { id: 'p1', full: false } }));
    expect(banner()).toBeNull();
    expect(recalcButton()).toBeNull();
    // «Refine» still works with text (OCT-232 §6): no «Recognize again», the reason under the field.
    expect(
      screen.queryByRole('button', { name: 'Recognize again' }),
    ).toBeNull();
    expect(screen.getByText('The photo is no longer stored')).toBeTruthy();
  });

  it('«Not now» drops the banner and patches the offer', async () => {
    await setup(withPhoto());
    expect(banner()).toBeTruthy();
    expect(recalcButton()).toBeNull(); // no duplicate while the banner is up
    fireEvent.click(button('Not now'));
    await waitFor(() => expect(banner()).toBeNull());
    await waitFor(() =>
      expect(sent).toContainEqual(
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ recalcOffer: false }),
        }),
      ),
    );
  });

  it('a saved meal without a photo takes one online, attached by PATCH on save (OCT-126)', async () => {
    const bare = withPhoto({ photo: null, recalcOffer: false });
    const picture = () =>
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Illustration: Grains & sides, change',
        }),
      );
    await setup(bare);
    const closeSheet = () =>
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Close',
        }),
      );
    // Offline: no photo items (only online, OCT-126).
    const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    picture();
    expect(screen.queryByRole('button', { name: 'From library' })).toBeNull();
    closeSheet();
    offline.mockRestore();
    act(() => void window.dispatchEvent(new Event('online')));

    expect(
      screen.queryByRole('button', { name: 'Recognize again' }),
    ).toBeNull();
    picture();
    fireEvent.click(button('From library'));
    fireEvent.change(screen.getByTestId('edit-photo'), {
      target: { files: [new File(['jpeg'], 'a.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() =>
      expect(document.querySelector('img.meal-edit__thumb')).toBeTruthy(),
    );
    // The photo can be recognized right away; the picture sheet no longer offers one.
    expect(button('Recognize again')).toBeTruthy();
    picture();
    expect(screen.queryByRole('button', { name: 'From library' })).toBeNull();
    closeSheet();
    fireEvent.click(button('Save'));
    await waitFor(() =>
      expect(sent).toContainEqual(
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ photoId: 'p1' }),
        }),
      ),
    );
  });

  async function uploadHeld(answer: Response) {
    let release!: () => void;
    const held = new Promise<Response>(
      (done) => (release = () => done(answer)),
    );
    await setup(withPhoto({ photo: null, recalcOffer: false }), {
      upload: () => held,
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Illustration: Grains & sides, change',
      }),
    );
    fireEvent.click(button('From library'));
    fireEvent.change(screen.getByTestId('edit-photo'), {
      target: { files: [new File(['jpeg'], 'a.jpg', { type: 'image/jpeg' })] },
    });
    const slot = await screen.findByRole('button', { name: 'Add photo' });
    return { slot, release };
  }
  const patches = () => sent.filter((s) => s.method === 'PATCH');

  it('a saved meal waits for its photo upload: spinner slot, Save busy (OCT-317)', async () => {
    const { slot, release } = await uploadHeld(
      Response.json({ photoId: 'p1' }, { status: 201 }),
    );
    expect(slot.getAttribute('aria-busy')).toBe('true');
    expect(slot.querySelector('.button__spinner')).toBeTruthy();
    const save = button('Save');
    expect(save.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(save);
    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true });
    await act(async () => {});
    expect(patches()).toEqual([]);

    await act(async () => release());
    await waitFor(() =>
      expect(document.querySelector('img.meal-edit__thumb')).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: 'Add photo' })).toBeNull();
    expect(button('Save').getAttribute('aria-busy')).toBeNull();
    fireEvent.click(button('Save'));
    await waitFor(() =>
      expect(patches()).toEqual([
        expect.objectContaining({
          body: expect.objectContaining({ photoId: 'p1' }),
        }),
      ]),
    );
  });

  it('a failed upload frees Save: the meal saves without a photo (OCT-317)', async () => {
    const { release } = await uploadHeld(
      Response.json({ error: { code: 'internal' } }, { status: 500 }),
    );
    await act(async () => release());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Add photo' })).toBeNull(),
    );
    expect(document.querySelector('img.meal-edit__thumb')).toBeNull();
    expect(button('Save').getAttribute('aria-busy')).toBeNull();
    fireEvent.change(weight(), { target: { value: '250' } });
    fireEvent.click(button('Save'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).not.toHaveProperty('photoId');
  });

  it('a failed upload reopens the picture sheet with the error and a retry, no toast (OCT-318)', async () => {
    let fail = true;
    await setup(withPhoto({ photo: null, recalcOffer: false }), {
      upload: () =>
        fail
          ? Response.json({ error: { code: 'internal' } }, { status: 500 })
          : Response.json({ photoId: 'p1' }, { status: 201 }),
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Illustration: Grains & sides, change',
      }),
    );
    fireEvent.click(button('From library'));
    const file = new File(['jpeg'], 'a.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('edit-photo'), {
      target: { files: [file] },
    });
    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe('The photo didn’t upload. Try again.');
    const sheet = screen.getByRole('dialog');
    expect(
      within(sheet).getByRole('button', { name: 'Take photo' }),
    ).toBeTruthy();
    expect(screen.queryByText('Couldn’t upload the photo')).toBeNull();

    fail = false;
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'From library' }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.change(screen.getByTestId('edit-photo'), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(document.querySelector('img.meal-edit__thumb')).toBeTruthy(),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offline the picture sheet has a hint in place of the photo items (OCT-318)', async () => {
    await setup(withPhoto({ photo: null, recalcOffer: false }), {
      upload: () =>
        Response.json({ error: { code: 'internal' } }, { status: 500 }),
    });
    const hint = 'You can add a photo once you’re back online';
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Illustration: Grains & sides, change',
      }),
    );
    expect(screen.queryByText(hint)).toBeNull();
    fireEvent.click(button('From library'));
    fireEvent.change(screen.getByTestId('edit-photo'), {
      target: { files: [new File(['jpeg'], 'a.jpg', { type: 'image/jpeg' })] },
    });
    await screen.findByRole('alert');

    // Gone offline with the error on screen: only the hint stays.
    const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(screen.getByText(hint)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'From library' })).toBeNull();

    offline.mockRestore();
    // Back online the data syncs: let it settle before the next test.
    await act(async () => void window.dispatchEvent(new Event('online')));
    expect(screen.queryByText(hint)).toBeNull();
    expect(button('From library')).toBeTruthy();
  });

  it('«Recognize again» shown: no «Recalculate from photo» (OCT-273)', async () => {
    await setup(withPhoto({ recalcOffer: false }));
    expect(button('Recognize again')).toBeTruthy();
    expect(recalcButton()).toBeNull();
  });

  it('no «Recognize again» (the model reads no photos): «Recalculate from photo» is back', async () => {
    await setup(withPhoto({ recalcOffer: false }));
    fireEvent.click(button('Recognize again'));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Recognize again' }),
      ).toBeNull(),
    );
    expect(recalcButton()).toBeTruthy();
  });

  it('keeps the draft; «Restore my numbers» brings it back as it was', async () => {
    await setup(withPhoto());
    fireEvent.click(screen.getByRole('radio', { name: 'Lunch' }));
    fireEvent.change(weight(), { target: { value: '400' } });
    fireEvent.click(button('Recalculate'));
    expect(dialog()).toBeNull(); // the leave guard lets it through
    await screen.findByText('Porridge');
    expect(
      screen.getByRole('radio', { name: 'Lunch' }).getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Restore my numbers' }),
    );
    expect(screen.queryByText('Porridge')).toBeNull();
    expect((weight() as HTMLInputElement).value).toBe('400');
  });

  it('saving sends one PATCH with the AI dishes and the offer cleared (AC-10.10)', async () => {
    await setup(withPhoto());
    fireEvent.click(button('Recalculate'));
    await screen.findByText('Porridge');
    expect(banner()).toBeNull();
    fireEvent.click(button('Save'));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      method: 'PATCH',
      url: '/api/meals/5',
      body: {
        recalcOffer: false,
        items: [expect.objectContaining({ name: 'Porridge', source: 'ai' })],
      },
    });
  });

  it('leaving after a recalculation asks, and the entry stays (AC-10.9)', async () => {
    await setup(withPhoto());
    fireEvent.click(button('Recalculate'));
    await screen.findByText('Porridge');
    // The rows show at commit, the screen marks itself dirty in an effect right after.
    await waitFor(() => expect(isDirty()).toBe(true));
    fireEvent.click(button('Close'));
    await act(async () => fireEvent.click(button('Don’t save')));
    expect(screen.getByText('Day page')).toBeTruthy();
    expect(sent).toEqual([]);
  });

  it('an expired photo: no «Try again», back to the entry unchanged (E-10.1)', async () => {
    await setup(withPhoto(), {
      recognize: () =>
        Response.json({ error: { code: 'photo_expired' } }, { status: 410 }),
    });
    fireEvent.click(button('Recalculate'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('The photo is no longer stored')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retake' })).toBeNull();
    fireEvent.click(button('Back to the entry'));
    expect(await screen.findByText('Buckwheat')).toBeTruthy();
    expect(sent).toEqual([]);
  });
});
