import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { MealInput, RecognizedDish } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { MealEditScreen } from './MealEditScreen';

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

async function setup(onSave = vi.fn(async (input: MealInput) => void input)) {
  await renderLoaded(
    <I18nProvider>
      <MealEditScreen
        dishes={[buckwheat]}
        photoId="p1"
        units="metric"
        onSave={onSave}
        onClose={() => {}}
        now={new Date(2026, 10, 15, 13, 24)}
      />
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
});
