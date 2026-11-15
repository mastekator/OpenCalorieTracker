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
import type { MealInput, RecognizedDish } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { LeaveGuard } from '../../app/LeaveGuard';
import { ToastProvider } from '../../ui/Toast/Toast';
import { MealEditScreen } from './MealEditScreen';
import { MEAL_EDIT_PATH } from './RecognitionScreen';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

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
          now={new Date(2026, 10, 15, 13, 24)}
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
    expect(
      screen.getByText('Weight from 1 to 5000 g (0.1 to 176.4 oz)'),
    ).toBeTruthy();
  });
});
