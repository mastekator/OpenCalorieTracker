import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useLocation } from 'wouter';
import type {
  MealInput,
  PreviousDishesInput,
  PreviousDishesResponse,
  RecognizedDish,
} from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { loadDict } from '../../i18n/translate';
import { renderLoaded } from '../../test-utils';
import { LeaveGuard } from '../../app/LeaveGuard';
import { ToastProvider } from '../../ui/Toast/Toast';
import { PILAF } from '../kitchen/fixtures';
import { MealEditScreen } from './MealEditScreen';
import { MEAL_EDIT_PATH, type MealEditState } from './RecognitionScreen';

// jsdom has no canvas: the photo slot takes the file as is.
vi.mock('./prepareImage', async (original) => ({
  ...(await original<typeof import('./prepareImage')>()),
  prepareImage: async (file: Blob) => file,
}));

type Previous = PreviousDishesResponse[number];
/** `POST /api/dishes/previous`: answers from `found` by dish name, null otherwise. */
const historyApi = (found: Record<string, Previous> = {}) =>
  vi.fn(async (_path: string, init?: RequestInit) =>
    Response.json(
      (JSON.parse(String(init?.body)) as PreviousDishesInput).dishes.map(
        (d) => found[d.name] ?? null,
      ),
    ),
  );
const lookups = (fetch: ReturnType<typeof historyApi>) =>
  fetch.mock.calls
    .filter(([path]) => path === '/api/dishes/previous')
    .map(([, init]) => JSON.parse(String(init?.body)) as PreviousDishesInput);

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  vi.stubGlobal('fetch', historyApi());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const buckwheat: RecognizedDish = {
  name: 'Buckwheat',
  grams: 150,
  kcal: 300,
  proteinG: 12,
  fatG: 3,
  carbsG: 60,
  confidence: 0.6,
};

const rice: RecognizedDish = {
  name: 'Rice',
  grams: 100,
  kcal: 130,
  proteinG: 3,
  fatG: 0,
  carbsG: 28,
  confidence: 0.9,
};

async function setup(
  onSave = vi.fn(async (input: MealInput) => void input),
  dishes = [buckwheat],
  mealId?: number,
) {
  await renderLoaded(
    <I18nProvider>
      <ToastProvider>
        <MealEditScreen
          dishes={dishes}
          photoId="p1"
          units="metric"
          onSave={onSave}
          onClose={() => {}}
          now={() => new Date(2026, 10, 15, 13, 24)}
          mealId={mealId}
        />
      </ToastProvider>
    </I18nProvider>,
  );
  const input = screen.getByRole('textbox', {
    name: 'Weight of Buckwheat',
  }) as HTMLInputElement;
  const save = () => screen.getByRole('button', { name: 'Save' });
  return { onSave, input, save };
}

describe('MealEditScreen', () => {
  it('recalculates the total live and drops the confidence badge after a weight edit', async () => {
    const { input } = await setup();
    expect(screen.getByText('approx.')).toBeTruthy();
    fireEvent.change(input, { target: { value: '200' } });
    expect(screen.getByText('400 kcal')).toBeTruthy(); // the row
    expect(document.querySelector('.meal-edit__kcal')!.textContent).toBe(
      '400 kcal',
    ); // the total
    expect(screen.queryByText('approx.')).toBeNull();
  });

  it.each(['0', '', '5001'])(
    'disables Save at weight «%s» (AC-3.4)',
    async (v) => {
      const { input, save } = await setup();
      fireEvent.change(input, { target: { value: v } });
      expect((save() as HTMLButtonElement).disabled).toBe(true);
    },
  );

  it('a double tap saves once, with the meal from the screen (E-4.2)', async () => {
    let done = () => {};
    const onSave = vi.fn((input: MealInput) =>
      new Promise<void>((r) => (done = r)).then(() => void input),
    );
    const { save } = await setup(onSave);
    fireEvent.click(save());
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }));
    await act(async () => done());
    expect(onSave).toHaveBeenCalledTimes(1);
    const input = onSave.mock.calls[0]![0];
    expect(input).toMatchObject({
      mealType: 'lunch',
      photoId: 'p1',
      localDate: '2026-11-15',
      items: [{ name: 'Buckwheat', grams: 150, kcal: 300, confidence: 0.6 }],
    });
  });

  it('a failed save keeps the edits and retries with the same clientId (E-4.3)', async () => {
    const onSave = vi
      .fn(async (input: MealInput) => void input)
      .mockRejectedValueOnce(new Error('quota'));
    const { input, save } = await setup(onSave);
    fireEvent.change(input, { target: { value: '200' } });
    await act(async () => fireEvent.click(save()));
    expect(screen.getByRole('alert').textContent).toContain('Couldn’t save');
    expect(input.value).toBe('200');
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Try again' })),
    );
    expect(onSave).toHaveBeenCalledTimes(2);
    const [first, second] = onSave.mock.calls.map((c) => c[0]);
    expect(second!.clientId).toBe(first!.clientId);
    expect(second!.items[0]).toMatchObject({ grams: 200, kcal: 400 });
    expect(second!.items[0]!.confidence).toBeUndefined();
  });

  it('saves with ⌘/Ctrl+Enter', async () => {
    const { onSave } = await setup();
    await act(async () =>
      fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true }),
    );
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  describe('«Dish» sheet (4.4)', () => {
    const open = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Edit Buckwheat' }));
    const sheet = () => screen.getByRole('dialog');
    const name = () => within(sheet()).getByRole('textbox', { name: 'Name' });

    it('a rename keeps kcal and macros (AC-3.5) and drops the badge', async () => {
      const { onSave, save } = await setup();
      open();
      fireEvent.change(name(), { target: { value: 'Kasha' } });
      fireEvent.click(within(sheet()).getByRole('button', { name: 'Done' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByText('Kasha')).toBeTruthy();
      expect(screen.getByText('300 kcal')).toBeTruthy();
      expect(screen.queryByText('approx.')).toBeNull();
      await act(async () => fireEvent.click(save()));
      expect(onSave.mock.calls[0]![0].items[0]).toMatchObject({
        name: 'Kasha',
        grams: 150,
        kcal: 300,
        proteinG: 12,
      });
    });

    it('a rename changes the illustration, except one picked by hand (AC-4.5)', async () => {
      const onSave = vi.fn(async (input: MealInput) => void input);
      await renderLoaded(
        <I18nProvider>
          <ToastProvider>
            <MealEditScreen
              // A loaded meal: rice was picked by hand (illustrationManual), buckwheat is automatic.
              dishes={[buckwheat, { ...rice, illustration: 'pizza' }]}
              units="metric"
              onSave={onSave}
              onClose={() => {}}
              choices={{ coffee: 'coffee-tea' }}
            />
          </ToastProvider>
        </I18nProvider>,
      );
      const illos = () =>
        [...document.querySelectorAll('.dish-row .dish-illo')].map((e) =>
          e.getAttribute('data-illo'),
        );
      expect(illos()).toEqual(['grains', 'pizza']);
      const rename = (dish: string, to: string) => {
        fireEvent.click(screen.getByRole('button', { name: `Edit ${dish}` }));
        fireEvent.change(
          within(sheet()).getByRole('textbox', { name: 'Name' }),
          {
            target: { value: to },
          },
        );
        fireEvent.click(within(sheet()).getByRole('button', { name: 'Done' }));
      };
      rename('Buckwheat', 'Borscht');
      rename('Rice', 'Pasta');
      expect(illos()).toEqual(['soup-borscht', 'pizza']);
      // A choice remembered for the name beats the dictionary.
      rename('Borscht', 'Coffee');
      expect(illos()[0]).toBe('coffee-tea');
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: 'Save' })),
      );
      const [auto, manual] = onSave.mock.calls[0]![0].items;
      expect(auto).not.toHaveProperty('illustration');
      expect(manual).toMatchObject({ illustration: 'pizza' });
    });

    describe('«Dish picture» (OCT-33 4.1)', () => {
      async function picker(
        dishes: (RecognizedDish & { illustration?: 'pizza' })[],
        photoId?: string,
      ) {
        const onSave = vi.fn(async (input: MealInput) => void input);
        const onChoice = vi.fn();
        await renderLoaded(
          <I18nProvider>
            <ToastProvider>
              <MealEditScreen
                dishes={dishes}
                photoId={photoId}
                units="metric"
                onSave={onSave}
                onClose={() => {}}
                onChoice={onChoice}
              />
            </ToastProvider>
          </I18nProvider>,
        );
        const save = () =>
          act(async () =>
            fireEvent.click(screen.getByRole('button', { name: 'Save' })),
          );
        return { onSave, onChoice, save };
      }
      const illo = () =>
        document
          .querySelector('.dish-row .dish-illo')!
          .getAttribute('data-illo');

      it('a pick is remembered for the name and sent with the dish (AC-4.4)', async () => {
        const { onSave, onChoice, save } = await picker([buckwheat]);
        fireEvent.click(
          screen.getByRole('button', {
            name: 'Illustration: Grains & sides, change',
          }),
        );
        const sheet = screen.getByRole('dialog');
        expect(
          within(sheet).getByText('Matched by the name “Buckwheat”'),
        ).toBeTruthy();
        expect(
          within(sheet)
            .getByRole('radio', { name: 'Grains & sides' })
            .getAttribute('aria-checked'),
        ).toBe('true');
        fireEvent.click(within(sheet).getByRole('radio', { name: 'Pizza' }));
        expect(onChoice).toHaveBeenCalledWith('Buckwheat', 'pizza');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(illo()).toBe('pizza');
        await save();
        expect(onSave.mock.calls[0]![0].items[0]).toMatchObject({
          illustration: 'pizza',
        });
      });

      it('«Restore automatic» sends null and drops the field (AC-4.7)', async () => {
        const { onSave, onChoice, save } = await picker([
          { ...buckwheat, illustration: 'pizza' },
        ]);
        fireEvent.click(
          screen.getByRole('button', { name: 'Illustration: Pizza, change' }),
        );
        const sheet = screen.getByRole('dialog');
        expect(
          within(sheet).getByText('Picked by you for “Buckwheat”'),
        ).toBeTruthy();
        fireEvent.click(
          within(sheet).getByRole('button', { name: 'Restore automatic' }),
        );
        expect(onChoice).toHaveBeenCalledWith('Buckwheat', null);
        expect(illo()).toBe('grains');
        await save();
        expect(onSave.mock.calls[0]![0].items[0]).not.toHaveProperty(
          'illustration',
        );
      });

      it('offers a photo only while the meal has none (AC-4.3)', async () => {
        await picker([buckwheat]);
        const open = () =>
          fireEvent.click(
            screen.getByRole('button', {
              name: 'Illustration: Grains & sides, change',
            }),
          );
        open();
        const camera = screen.getByTestId('edit-camera') as HTMLInputElement;
        const click = vi.spyOn(camera, 'click');
        fireEvent.click(screen.getByRole('button', { name: 'Take photo' }));
        expect(click).toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
        open();
        expect(
          screen.getByRole('button', { name: 'From library' }),
        ).toBeTruthy();
        cleanup();
        await picker([buckwheat], 'p1');
        open();
        expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
        expect(
          screen.queryByRole('button', { name: 'From library' }),
        ).toBeNull();
      });
    });

    it('an empty name is not accepted', async () => {
      await setup();
      open();
      fireEvent.change(name(), { target: { value: '  ' } });
      fireEvent.click(within(sheet()).getByRole('button', { name: 'Done' }));
      expect(sheet()).toBeTruthy();
      expect(within(sheet()).getByText('Enter a name')).toBeTruthy();
      expect(name().getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(name());
    });

    it('the weight recalculates live in the sheet and applies on Done', async () => {
      await setup();
      open();
      fireEvent.change(
        within(sheet()).getByRole('textbox', { name: 'Weight of Buckwheat' }),
        { target: { value: '300' } },
      );
      expect(within(sheet()).getByText('600 kcal')).toBeTruthy();
      fireEvent.click(within(sheet()).getByRole('button', { name: 'Done' }));
      expect(document.querySelector('.meal-edit__kcal')!.textContent).toBe(
        '600 kcal',
      );
    });

    it('an out-of-range recognized weight stays invalid after Done (AC-3.4)', async () => {
      const { save } = await setup(undefined, [{ ...buckwheat, grams: 6000 }]);
      open();
      fireEvent.click(within(sheet()).getByRole('button', { name: 'Done' }));
      expect(sheet()).toBeTruthy();
      expect((save() as HTMLButtonElement).disabled).toBe(true);
    });

    it('closing without Done drops the draft', async () => {
      await setup();
      open();
      fireEvent.change(name(), { target: { value: 'Kasha' } });
      fireEvent.click(within(sheet()).getByRole('button', { name: 'Close' }));
      expect(screen.queryByText('Kasha')).toBeNull();
      expect(screen.getByText('Buckwheat')).toBeTruthy();
    });
  });

  describe('delete (4.5, 4.6)', () => {
    const names = () =>
      [...document.querySelectorAll('.dish-row__name')].map(
        (b) => b.textContent,
      );

    it('deletes, and «Undo» puts the dish back in its place (AC-3.6)', async () => {
      await setup(undefined, [buckwheat, rice]);
      fireEvent.click(screen.getByRole('button', { name: 'Delete Buckwheat' }));
      expect(names()).toEqual(['Rice']);
      expect(await screen.findByText('Buckwheat deleted')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(names()).toEqual(['Buckwheat', 'Rice']);
    });

    it('«Delete dish» in the sheet deletes too, focus goes to the previous row', async () => {
      await setup(undefined, [buckwheat, rice]);
      fireEvent.click(screen.getByRole('button', { name: 'Edit Rice' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete dish' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(names()).toEqual(['Buckwheat']);
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Edit Buckwheat' }),
      );
    });

    it('focus goes to the next row after a delete and to the restored row after «Undo»', async () => {
      // The history answer lands after the delete: its render's effect runs right after the «Undo» click (OCT-368).
      const answer = historyApi();
      vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
        await new Promise((r) => setTimeout(r, 0));
        return answer(path, init);
      });
      await setup(undefined, [buckwheat, rice]);
      fireEvent.click(screen.getByRole('button', { name: 'Delete Buckwheat' }));
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Edit Rice' }),
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Edit Buckwheat' }),
      );
    });

    it('all deleted: the empty state and Save disabled (AC-3.7)', async () => {
      const { save } = await setup();
      fireEvent.click(screen.getByRole('button', { name: 'Delete Buckwheat' }));
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'No dishes in the list' }),
      );
      expect(screen.getByRole('button', { name: 'Retake' })).toBeTruthy();
      expect((save() as HTMLButtonElement).disabled).toBe(true);
    });
  });
});

describe('leaving the edit screen (4.7)', () => {
  const dialog = () => screen.queryByRole('alertdialog');
  const button = (name: string) => screen.getByRole('button', { name });

  function Flow({ onSave }: { onSave: (input: MealInput) => void }) {
    const [path, navigate] = useLocation();
    if (path !== MEAL_EDIT_PATH) return <p>Today page</p>;
    return (
      <MealEditScreen
        dishes={[buckwheat]}
        units="metric"
        onSave={async (input) => {
          onSave(input);
          navigate('/', { replace: true });
        }}
        onClose={() => navigate('/')}
      />
    );
  }

  async function flow() {
    history.replaceState(null, '', '/');
    history.pushState(null, '', MEAL_EDIT_PATH);
    const onSave = vi.fn();
    await renderLoaded(
      <I18nProvider>
        <ToastProvider>
          <LeaveGuard>
            <Flow onSave={onSave} />
          </LeaveGuard>
        </ToastProvider>
      </I18nProvider>,
    );
    return onSave;
  }

  it('the browser «Back» asks even without edits; Stay keeps the screen (AC-3.12)', async () => {
    await flow();
    act(() => history.back());
    await waitFor(() => expect(dialog()).toBeTruthy());
    expect(dialog()!.textContent).toContain('Save this meal?');
    expect(dialog()!.textContent).toContain(
      'Otherwise the recognized dishes will be lost.',
    );
    expect(document.activeElement).toBe(button('Stay'));
    fireEvent.click(button('Stay'));
    expect(dialog()).toBeNull();
    expect(location.pathname).toBe(MEAL_EDIT_PATH);
    expect(screen.getByText('Buckwheat')).toBeTruthy();
  });

  it('the close button and Esc ask; Don’t save leaves', async () => {
    await flow();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog()).toBeTruthy();
    fireEvent.click(button('Stay'));
    fireEvent.click(button('Close'));
    expect(dialog()).toBeTruthy();
    fireEvent.click(button('Don’t save'));
    expect(screen.getByText('Today page')).toBeTruthy();
  });

  it('Save and leave saves once and navigates once', async () => {
    const onSave = await flow();
    const entries = history.length;
    fireEvent.click(button('Close'));
    await act(async () => fireEvent.click(button('Save and leave')));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Today page')).toBeTruthy();
    expect(location.pathname).toBe('/');
    expect(history.length).toBe(entries); // the save's own replace, no second push
  });

  it('Save and leave with an invalid weight stays (E-0.4)', async () => {
    const onSave = await flow();
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Weight of Buckwheat' }),
      { target: { value: '0' } },
    );
    fireEvent.click(button('Close'));
    await act(async () => fireEvent.click(button('Save and leave')));
    expect(onSave).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
    expect(location.pathname).toBe(MEAL_EDIT_PATH);
    expect(screen.getByText('Weight from 1 to 5000 g')).toBeTruthy();
  });
});

type Manual = Extract<MealEditState, { manual: unknown }>['manual'];

describe('MealEditScreen: manual entry (OCT-60)', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function open(
    manual: Manual | undefined,
    {
      photoId,
      dishes = [],
    }: { photoId?: string; dishes?: RecognizedDish[] } = {},
  ) {
    const onSave = vi.fn(async (input: MealInput, photo?: Blob) => {
      void input;
      void photo;
    });
    await renderLoaded(
      <I18nProvider>
        <ToastProvider>
          <MealEditScreen
            dishes={dishes}
            manual={manual}
            photoId={photoId}
            units="metric"
            onSave={onSave}
            onClose={() => {}}
            now={() => new Date(2026, 10, 15, 13, 24)}
          />
        </ToastProvider>
      </I18nProvider>,
    );
    return onSave;
  }

  const enter = (name = 'Cottage cheese') => {
    const type = (label: RegExp, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    type(/^Name/, name);
    type(/^Weight ·/, '200');
    type(/^Calories ·/, '150');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  };
  const save = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await act(async () => {});
  };

  it('from Today: the sheet opens at once, the dish gets the «manual» badge (AC-5.5, AC-3.9)', async () => {
    const onSave = await open('user');
    expect(
      screen.getByRole('dialog', { name: 'Add dish manually' }),
    ).toBeTruthy();
    enter();
    expect(
      screen.queryByRole('dialog', { name: 'Add dish manually' }),
    ).toBeNull();
    expect(screen.getByText('manual')).toBeTruthy();
    expect(screen.queryByText(/AI estimate/)).toBeNull();
    expect(document.body.textContent).not.toContain('set up');
    await save();
    const input = onSave.mock.calls[0]![0];
    expect(input.items).toEqual([
      {
        name: 'Cottage cheese',
        grams: 200,
        kcal: 300,
        proteinG: 0,
        fatG: 0,
        carbsG: 0,
        source: 'manual',
      },
    ]);
    expect(input).not.toHaveProperty('photoId');
    expect(input).not.toHaveProperty('recalcOffer');
  });

  it.each([
    ['not_configured', 'Photo recognition isn’t set up'],
    ['no_vision', 'The current model can’t read photos'],
    ['ai_down', 'AI is unavailable'],
  ] as const)(
    'AI %s with a photo: banner, open sheet, saved with recalcOffer (5.3, 5.6)',
    async (manual, text) => {
      const onSave = await open(manual, { photoId: 'p1' });
      expect(document.body.textContent).toContain(text);
      enter();
      await save();
      expect(onSave.mock.calls[0]![0]).toMatchObject({
        photoId: 'p1',
        recalcOffer: true,
      });
    },
  );

  it('«Add a dish manually» next to AI dishes keeps their confidence (AC-3.8)', async () => {
    const onSave = await open(undefined, {
      photoId: 'p1',
      dishes: [buckwheat],
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add a dish manually' }),
    );
    enter('Tea');
    await save();
    const input = onSave.mock.calls[0]![0];
    expect(input.items.map((i) => [i.source, i.confidence])).toEqual([
      ['ai', 0.6],
      ['manual', undefined],
    ]);
    expect(input).not.toHaveProperty('recalcOffer');
  });

  it('the photo slot uploads a photo without recognizing it (AC-5.7)', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ photoId: 'p9' }, { status: 201 }),
    );
    vi.stubGlobal('fetch', fetch);
    const onSave = await open('user');
    enter();
    const file = new File(['jpeg'], 'a.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('edit-photo'), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(document.querySelector('img.meal-edit__thumb')).toBeTruthy(),
    );
    expect(
      fetch.mock.calls
        .map((c) => (c as unknown[])[0])
        .filter((p) => p !== '/api/dishes/previous'),
    ).toEqual(['/api/photos']);
    await save();
    expect(onSave.mock.calls[0]![0]).toMatchObject({ photoId: 'p9' });
    expect(onSave.mock.calls[0]![0]).not.toHaveProperty('recalcOffer');
    expect(onSave.mock.calls[0]![1]).toBeUndefined();
  });

  it('a thumbnail that fails to load becomes a quiet placeholder (OCT-196)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ photoId: 'gone' }, { status: 201 })),
    );
    await open('user');
    fireEvent.change(screen.getByTestId('edit-photo'), {
      target: { files: [new File(['jpeg'], 'a.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() =>
      expect(document.querySelector('img.meal-edit__thumb')).toBeTruthy(),
    );
    fireEvent.error(document.querySelector('img.meal-edit__thumb')!);
    expect(document.querySelector('img.meal-edit__thumb')).toBeNull();
    expect(
      screen.getByRole('img', { name: 'Photo unavailable' }).className,
    ).toContain('meal-edit__thumb--broken');
  });

  it('the photo slot is named «Add photo» and spins while uploading', async () => {
    let upload!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        path === '/api/photos'
          ? new Promise<Response>((r) => (upload = r))
          : Promise.resolve(Response.json([])),
      ),
    );
    await open('user');
    const slot = screen.getByRole('button', { name: 'Add photo' });
    expect(slot.querySelector('.button__spinner')).toBeNull();
    fireEvent.change(screen.getByTestId('edit-photo'), {
      target: { files: [new File(['jpeg'], 'a.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(slot.getAttribute('aria-busy')).toBe('true'));
    expect(
      slot.querySelector('.button__spinner')?.getAttribute('aria-hidden'),
    ).toBe('true');
    upload(Response.json({ photoId: 'p9' }, { status: 201 }));
    await waitFor(() =>
      expect(document.querySelector('img.meal-edit__thumb')).toBeTruthy(),
    );
    expect(document.querySelector('.button__spinner')).toBeNull();
  });

  it('a slot photo that failed to upload is queued with the meal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    // jsdom has no object URLs.
    URL.createObjectURL = () => 'blob:photo';
    URL.revokeObjectURL = () => {};
    const onSave = await open('user');
    enter();
    const file = new File(['jpeg'], 'a.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('edit-photo'), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(document.querySelector('img.meal-edit__thumb')).toBeTruthy(),
    );
    await save();
    expect(onSave.mock.calls[0]![0]).not.toHaveProperty('photoId');
    expect(onSave.mock.calls[0]![1]).toBe(file);
  });
});

describe('MealEditScreen entry day (OCT-19 3.2, AC-2.11, AC-2.12)', () => {
  async function open(props: { now: () => Date; date?: string }) {
    const onSave = vi.fn(async (input: MealInput) => void input);
    await renderLoaded(
      <I18nProvider>
        <ToastProvider>
          <MealEditScreen
            dishes={[buckwheat]}
            units="metric"
            onSave={onSave}
            onClose={() => {}}
            {...props}
          />
        </ToastProvider>
      </I18nProvider>,
    );
    const save = async () => {
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: 'Save' })),
      );
      return onSave.mock.calls[0]![0];
    };
    return { save };
  }
  const dayGroup = () => screen.queryByRole('radiogroup', { name: 'Day' });

  it('from 00:00 to 03:59 offers «Yesterday | Today», «Yesterday» and a snack by default', async () => {
    const { save } = await open({ now: () => new Date(2026, 10, 15, 0, 35) });
    // The title keeps the real day: «Yesterday, 0:35» would read as yesterday at 0:35.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Today, 12:35 AM',
    );
    const group = dayGroup()!;
    expect(
      within(group)
        .getByRole('radio', { name: 'Yesterday' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByText(/late snack toward yesterday, November 14/),
    ).toBeTruthy();
    expect(await save()).toMatchObject({
      mealType: 'snack',
      localDate: '2026-11-14',
    });
  });

  it('«Today» in the window keeps today', async () => {
    const { save } = await open({ now: () => new Date(2026, 10, 15, 3, 59) });
    fireEvent.click(screen.getByRole('radio', { name: 'Today' }));
    expect(await save()).toMatchObject({ localDate: '2026-11-15' });
  });

  it('has no day choice outside the window', async () => {
    await open({ now: () => new Date(2026, 10, 15, 4, 0) });
    expect(dayGroup()).toBeNull();
  });

  it('takes the day and time at Save: opened 23:59, saved 00:01 is a late snack (E-1.4)', async () => {
    let clock = new Date(2026, 10, 14, 23, 59);
    const { save } = await open({ now: () => clock });
    expect(dayGroup()).toBeNull();
    clock = new Date(2026, 10, 15, 0, 1);
    expect(await save()).toMatchObject({
      localDate: '2026-11-14',
      eatenAt: clock.toISOString(),
    });
  });

  it('a past day gets its date, lunch at 13:00, the time following the type until edited', async () => {
    const { save } = await open({
      now: () => new Date(2026, 10, 15, 0, 35),
      date: '2026-11-10',
    });
    expect(dayGroup()).toBeNull();
    const time = screen.getByLabelText('Time') as HTMLInputElement;
    // Shown in the app's format, as in the title (OCT-198).
    const shown = () => time.previousElementSibling!.textContent;
    expect(time.value).toBe('13:00');
    expect(shown()).toBe('1:00\u00a0PM');
    fireEvent.click(screen.getByRole('radio', { name: 'Dinner' }));
    expect(time.value).toBe('19:00');
    expect(shown()).toBe('7:00\u00a0PM');
    fireEvent.change(time, { target: { value: '20:15' } });
    expect(shown()).toBe('8:15\u00a0PM');
    // A cleared field keeps the time.
    fireEvent.change(time, { target: { value: '' } });
    expect(shown()).toBe('8:15\u00a0PM');
    fireEvent.click(screen.getByRole('radio', { name: 'Breakfast' }));
    expect(time.value).toBe('20:15');
    expect(await save()).toMatchObject({
      mealType: 'breakfast',
      localDate: '2026-11-10',
      eatenAt: new Date(2026, 10, 10, 20, 15).toISOString(),
    });
  });

  it('a past day shows the time in Russian as in the title', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ru');
    await loadDict('ru');
    await open({ now: () => new Date(2026, 10, 15, 9, 0), date: '2026-11-10' });
    const time = screen.getByLabelText('Время');
    expect(time.previousElementSibling!.textContent).toBe('13:00');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      '13:00',
    );
  });

  it('a past day starts at lunch, 13:00', async () => {
    const { save } = await open({
      now: () => new Date(2026, 10, 15, 9, 0),
      date: '2026-11-10',
    });
    expect(await save()).toMatchObject({
      mealType: 'lunch',
      localDate: '2026-11-10',
      eatenAt: new Date(2026, 10, 10, 13, 0).toISOString(),
    });
  });
});

describe('MealEditScreen: same as last time (4.3, OCT-61)', () => {
  const last: NonNullable<Previous> = {
    mealId: 7,
    eatenAt: '2026-11-12T12:30:00.000Z',
    grams: 200,
    unit: 'g',
    kcal: 380,
    proteinG: 14,
    fatG: 5,
    carbsG: 70,
    illustration: 'grains',
  };
  const hint = () => screen.queryByText(/^Looks like your entry from/);

  async function withHistory(mealId?: number) {
    const fetch = historyApi({ Buckwheat: last });
    vi.stubGlobal('fetch', fetch);
    const ctx = await setup(undefined, [buckwheat, rice], mealId);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // Let the answer land.
    await act(() => new Promise((r) => setTimeout(r, 10)));
    return { ...ctx, fetch };
  }

  it('one request with the AI kcal per 100 g; the hint only under the match', async () => {
    const { fetch } = await withHistory();
    expect(lookups(fetch)).toEqual([
      {
        dishes: [
          { name: 'Buckwheat', kcalPer100: 200 },
          { name: 'Rice', kcalPer100: 130 },
        ],
      },
    ]);
    expect(screen.getAllByText(/^Looks like your entry from/)).toHaveLength(1);
    expect(hint()!.textContent).toBe(
      'Looks like your entry from Nov 12: 200\u00a0g · 380\u00a0kcal',
    );
    // The previous entry's illustration (OCT-33).
    expect(
      document
        .querySelector('.history-hint .dish-illo')!
        .getAttribute('data-illo'),
    ).toBe('grains');
  });

  it('a match from the meal being edited is not shown', async () => {
    await withHistory(7);
    expect(hint()).toBeNull();
  });

  it('without a tap the AI estimate is saved', async () => {
    const { onSave, save } = await withHistory();
    await act(async () => fireEvent.click(save()));
    expect(onSave.mock.calls[0]![0].items[0]).toEqual({
      ...buckwheat,
      source: 'ai',
    });
  });

  it('«Keep estimate» hides the hint', async () => {
    await withHistory();
    fireEvent.click(screen.getByRole('button', { name: 'Keep estimate' }));
    expect(hint()).toBeNull();
    expect(document.activeElement!.classList).toContain('dish-row__edit');
  });

  it('«Same as last time» saves the previous values from history; weight recalculates from them', async () => {
    const { onSave, save, input } = await withHistory();
    fireEvent.click(screen.getByRole('button', { name: 'Same as last time' }));
    expect(hint()).toBeNull();
    expect(document.activeElement!.classList).toContain('dish-row__edit');
    expect(screen.getByText('as last time')).toBeTruthy();
    expect(await screen.findByText('Used your previous entry')).toBeTruthy();
    fireEvent.change(input, { target: { value: '100' } });
    await act(async () => fireEvent.click(save()));
    expect(onSave.mock.calls[0]![0].items[0]).toEqual({
      name: 'Buckwheat',
      grams: 100,
      kcal: 190,
      proteinG: 7,
      fatG: 2.5,
      carbsG: 35,
      source: 'history',
    });
  });

  it('«Undo» brings the AI estimate back', async () => {
    const { onSave, save } = await withHistory();
    fireEvent.click(screen.getByRole('button', { name: 'Same as last time' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(screen.queryByText('as last time')).toBeNull();
    await act(async () => fireEvent.click(save()));
    expect(onSave.mock.calls[0]![0].items[0]).toEqual({
      ...buckwheat,
      source: 'ai',
    });
  });

  it('a rename looks up after 300 ms, only the last name (AC-11.6)', async () => {
    const { fetch } = await withHistory();
    const rename = (from: string, value: string) => {
      fireEvent.click(screen.getByRole('button', { name: `Edit ${from}` }));
      const sheet = screen.getByRole('dialog');
      fireEvent.change(within(sheet).getByRole('textbox', { name: 'Name' }), {
        target: { value },
      });
      fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    };
    vi.useFakeTimers();
    rename('Buckwheat', 'Kasha');
    expect(hint()).toBeNull(); // the old name's hint goes
    await act(async () => vi.advanceTimersByTime(200));
    rename('Kasha', 'Grechka');
    await act(async () => vi.advanceTimersByTime(299));
    expect(lookups(fetch)).toHaveLength(1);
    await act(async () => vi.advanceTimersByTime(1));
    expect(lookups(fetch).slice(1)).toEqual([
      { dishes: [{ name: 'Grechka', kcalPer100: 200 }] },
    ]);
  });
});

describe('MealEditScreen: recipes (OCT-160 §5, ADR-0023 §5–6)', () => {
  // 166.05 kcal per 100 g, 350 g per serving.
  const pilaf = { ...PILAF, name: 'Buckwheat' };

  async function open(props: Partial<Parameters<typeof MealEditScreen>[0]>) {
    const onSave = vi.fn(async (input: MealInput) => void input);
    await renderLoaded(
      <I18nProvider>
        <ToastProvider>
          <MealEditScreen
            dishes={[buckwheat, rice]}
            units="metric"
            onSave={onSave}
            onClose={() => {}}
            now={() => new Date(2026, 10, 15, 13, 24)}
            recipes={[pilaf]}
            {...props}
          />
        </ToastProvider>
      </I18nProvider>,
    );
    await act(() => new Promise((r) => setTimeout(r, 10)));
    return onSave;
  }
  const save = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await act(async () => {});
  };
  const hint = () => screen.queryByText(/^Your recipe:/);

  it('a dish named like a recipe gets «Your recipe» and no history lookup', async () => {
    const fetch = historyApi({
      Buckwheat: {
        mealId: 7,
        eatenAt: '2026-11-12T12:30:00.000Z',
        grams: 200,
        unit: 'g',
        kcal: 380,
        proteinG: 14,
        fatG: 5,
        carbsG: 70,
        illustration: 'grains',
      },
    });
    vi.stubGlobal('fetch', fetch);
    await open({});
    expect(hint()!.textContent).toBe('Your recipe: Buckwheat · 166 kcal/100 g');
    expect(screen.queryByText(/^Looks like your entry from/)).toBeNull();
    expect(lookups(fetch)).toEqual([
      { dishes: [{ name: 'Rice', kcalPer100: 130 }] },
    ]);
  });

  it('«Use the recipe» keeps the weight and takes the recipe per 100 g; «Undo» brings the estimate back', async () => {
    const onSave = await open({});
    fireEvent.click(screen.getByRole('button', { name: 'Use the recipe' }));
    expect(hint()).toBeNull();
    expect(screen.getByText('recipe')).toBeTruthy();
    expect(await screen.findByText('Used your recipe')).toBeTruthy();
    await save();
    expect(onSave.mock.calls[0]![0].items[0]).toMatchObject({
      name: 'Buckwheat',
      grams: 150,
      kcal: expect.closeTo(249.1, 1),
      source: 'recipe',
      recipeId: 1,
    });

    cleanup();
    const again = await open({});
    fireEvent.click(screen.getByRole('button', { name: 'Use the recipe' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await save();
    expect(again.mock.calls[0]![0].items[0]).toEqual({
      ...buckwheat,
      source: 'ai',
    });
  });

  it('AC-4.5: «Manually» → recipe → «Add» → «Save», four taps', async () => {
    const onSave = await open({ dishes: [], manual: 'user', recipes: [PILAF] });
    expect(screen.getByText('My recipes · recent')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Homemade pilaf/ }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Homemade pilaf' })).getByRole(
        'button',
        { name: 'Add' },
      ),
    );
    await save();
    expect(onSave.mock.calls[0]![0].items).toEqual([
      expect.objectContaining({
        name: 'Homemade pilaf',
        grams: 350,
        source: 'recipe',
        recipeId: 1,
      }),
    ]);
  });

  it('a renamed recipe dish is a manual one, without the link', async () => {
    const onSave = await open({ dishes: [], manual: 'user', recipes: [PILAF] });
    fireEvent.click(screen.getByRole('button', { name: /^Homemade pilaf/ }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Add' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Homemade pilaf' }),
    );
    const sheet = screen.getByRole('dialog');
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Plov' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    await save();
    const item = onSave.mock.calls[0]![0].items[0]!;
    expect(item).toMatchObject({ name: 'Plov', source: 'manual' });
    expect(item).not.toHaveProperty('recipeId');
  });

  describe('barcodes (OCT-313)', () => {
    it('a product found by barcode is saved with its source and code in one tap', async () => {
      const onSave = await open({
        dishes: [{ ...buckwheat, source: 'barcode', barcode: '4607012345678' }],
      });
      await save();
      expect(onSave.mock.calls[0]![0].items).toEqual([
        expect.objectContaining({
          name: 'Buckwheat',
          source: 'barcode',
          barcode: '4607012345678',
        }),
      ]);
    });

    const code = '4607012345677';
    const yogurt = {
      ...buckwheat,
      name: 'Yogurt',
      source: 'barcode' as const,
      barcode: code,
      from: 'off' as const,
    };
    const badges = (dish: string) =>
      screen
        .getByRole('button', { name: `Edit ${dish}` })
        .closest('.dish-row')!
        .querySelector('.dish-row__meta')!.textContent;

    it('a package keeps its source badge after a weight and a name edit (2)', async () => {
      await open({ dishes: [yogurt, rice] });
      expect(badges('Yogurt')).toContain('barcode');
      fireEvent.change(
        screen.getByRole('textbox', { name: 'Weight of Yogurt' }),
        {
          target: { value: '200' },
        },
      );
      fireEvent.click(screen.getByRole('button', { name: 'Edit Yogurt' }));
      const sheet = screen.getByRole('dialog');
      fireEvent.change(within(sheet).getByLabelText('Name'), {
        target: { value: 'Greek yogurt' },
      });
      fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
      await act(async () => {});
      expect(badges('Greek yogurt')).toContain('barcode');
    });

    it('mixed sources get the package caption; packages alone get none (2)', async () => {
      await open({ dishes: [yogurt, rice] });
      screen.getByText(/^Barcode and label numbers come from the package/);
      cleanup();
      await open({ dishes: [yogurt] });
      expect(screen.queryByText(/^Barcode and label numbers/)).toBeNull();
      expect(screen.queryByText('AI estimate — check the weight.')).toBeNull();
    });

    it('an own product shows «your product» and its save date in the sheet (E-8, 2.6)', async () => {
      const savedAt = '2026-11-02T10:00:00Z';
      await open({
        dishes: [{ ...yogurt, from: 'mine' }],
        products: new Map([
          [
            code,
            {
              code,
              name: 'Yogurt',
              brand: null,
              kcal100: 200,
              protein100: 8,
              fat100: 2,
              carbs100: 40,
              per: 'g',
              servingG: 150,
              servingText: null,
              savedAt,
            },
          ],
        ]),
      });
      expect(badges('Yogurt')).toContain('your product');
      // 150 g is one serving: the row and the sheet count servings (OCT-389).
      const row = screen
        .getByRole('button', { name: 'Edit Yogurt' })
        .closest('.dish-row')!;
      expect(row.querySelector('.dish-row__share')!.textContent).toBe(
        '1\u00a0serving · 150\u00a0g',
      );
      fireEvent.click(
        within(row as HTMLElement).getByRole('button', {
          name: 'More by ½ serving',
        }),
      );
      expect(row.querySelector('.dish-row__share')!.textContent).toBe(
        '1½\u00a0servings · 225\u00a0g',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Edit Yogurt' }));
      const sheet = screen.getByRole('dialog');
      expect(
        within(sheet)
          .getByRole('radio', { name: 'Servings' })
          .getAttribute('aria-checked'),
      ).toBe('true');
      within(sheet).getByText('Your product · saved November 2, 2026');
      expect(within(sheet).queryByRole('link')).toBeNull();
    });

    it('an Open Food Facts product is credited in the sheet with a link (2.6)', async () => {
      await open({ dishes: [yogurt] });
      fireEvent.click(screen.getByRole('button', { name: 'Edit Yogurt' }));
      const sheet = screen.getByRole('dialog');
      within(sheet).getByText('Open Food Facts · by barcode');
      within(sheet).getByText('Per 100 g: 200 kcal · P 8 · F 2 · C 40');
      expect(
        within(sheet)
          .getByRole('link', { name: 'Open in Open Food Facts' })
          .getAttribute('href'),
      ).toBe(`https://world.openfoodfacts.org/product/${code}`);
    });

    it('says a label dish with a code will be remembered; a found one won’t (AC-4.5)', async () => {
      await open({
        dishes: [yogurt, { ...rice, source: 'label', barcode: '96385074' }],
      });
      screen.getByText(
        'After saving we’ll remember Rice with its barcode — next time it’s found at once, without AI.',
      );
      expect(screen.queryByText(/remember Yogurt/)).toBeNull();
      expect(badges('Rice')).toContain('label');
    });

    it('no AI, the photo’s code not found: the manual sheet opens with it (3.4)', async () => {
      await open({
        dishes: [],
        manual: 'not_configured',
        photoBarcode: { code: '4607012345678', admin: false },
        onBarcode: vi.fn(),
      });
      const sheet = screen.getByRole('dialog');
      expect(
        (within(sheet).getByLabelText('Barcode') as HTMLInputElement).value,
      ).toBe('4607012345678');
      expect(sheet.textContent).toContain(
        'Ask your admin to connect AI to read labels.',
      );
    });
  });
});
