import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Recipe, RecipeInput } from '@oct/shared';
import { isDirty, saveDirty } from '../../app/dirty';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { ToastProvider } from '../../ui/Toast/Toast';
import { PILAF, SALAD } from './fixtures';
import { RecipeEditor } from './RecipeEditor';

// jsdom has no canvas: the photo is taken as is.
vi.mock('../meals/prepareImage', async (original) => ({
  ...(await original<typeof import('../meals/prepareImage')>()),
  prepareImage: async (file: Blob) => file,
}));

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const view = async (
  props: Partial<Parameters<typeof RecipeEditor>[0]> = {},
) => {
  const onSave = vi.fn<(input: RecipeInput) => Promise<Recipe>>(
    async () => PILAF,
  );
  const onSaved = vi.fn<(recipe: Recipe) => void>();
  await renderLoaded(
    <I18nProvider>
      <ToastProvider>
        <RecipeEditor
          online
          search={async () => []}
          onSave={onSave}
          onSaved={onSaved}
          {...props}
        />
      </ToastProvider>
    </I18nProvider>,
  );
  return { onSave, onSaved };
};

const total = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling!.firstChild!
    .textContent;
const save = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
const grams = (name: string) => screen.getByLabelText(`${name}, grams`);
const cookedField = () =>
  screen.getByLabelText('Cooked weight') as HTMLInputElement;

describe('RecipeEditor', () => {
  it('totals follow every input (AC-2.3, 2.4)', async () => {
    await view({ recipe: PILAF });
    expect(total('Serving')).toBe('581');
    expect(total('100 g')).toBe('166');
    expect(total('Total')).toBe('3,487');
    fireEvent.change(grams('Long-grain rice'), { target: { value: '200' } });
    expect(total('Total')).toBe('2,767');
    fireEvent.click(screen.getByRole('button', { name: 'More servings' }));
    expect(total('Serving')).toBe(String(Math.round(2767 / 7)));
  });

  it('no servings: «—»; no cooked weight: totals by the raw weight and the weigh hint', async () => {
    await view({ recipe: SALAD });
    expect(total('Serving')).toBe('—');
    expect(total('100 g')).toBe(String(Math.round((534 / 620) * 100)));
    expect(screen.getByText(/raw weight: 620/)).toBeTruthy();
  });

  it('cooked 3+ times off the raw weight warns but saves (E-10.2)', async () => {
    const { onSave } = await view({ recipe: SALAD });
    fireEvent.change(cookedField(), { target: { value: '1860' } });
    expect(screen.getByText(/cooked is 3× heavier/)).toBeTruthy();
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].cookedG).toBe(1860);
  });

  it('the weight warning declines «раза / раз» by the ratio', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ru');
    await view({ recipe: SALAD });
    const cooked = await screen.findByLabelText('Вес готового');
    fireEvent.change(cooked, { target: { value: '1860' } });
    expect(screen.getByText(/в 3 раза тяжелее/)).toBeTruthy();
    fireEvent.change(cooked, { target: { value: '3100' } });
    expect(screen.getByText(/в 5 раз тяжелее/)).toBeTruthy();
  });

  it('totals carry «kcal», «—» does not', async () => {
    await view({ recipe: SALAD });
    const dd = (label: string) =>
      screen.getByText(label, { selector: 'dt' }).nextElementSibling!
        .textContent;
    expect(dd('Total')).toBe('534\u00a0kcal');
    expect(dd('Serving')).toBe('—');
  });

  it('servings stepper is a group named «Servings»', async () => {
    await view({ recipe: PILAF });
    expect(screen.getByRole('group', { name: 'Servings' })).toBeTruthy();
  });

  it('cooked weight takes no minus and no 0 (E-10.1)', async () => {
    const { onSave } = await view({ recipe: SALAD });
    fireEvent.change(cookedField(), { target: { value: '-5' } });
    expect(cookedField().value).toBe('5');
    fireEvent.change(cookedField(), { target: { value: '0' } });
    save();
    expect(await screen.findByText('More than 0 g')).toBeTruthy();
    expect(document.activeElement).toBe(cookedField());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('an empty name and no ingredients are marked on Save, nothing is sent', async () => {
    const { onSave } = await view();
    save();
    expect(await screen.findByText('Enter a name')).toBeTruthy();
    expect(screen.getByText('Add at least one ingredient')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a bad ingredient weight blocks Save; 0 g is fine', async () => {
    const { onSave } = await view({ recipe: SALAD });
    fireEvent.change(grams('Feta'), { target: { value: '6000' } });
    save();
    expect(await screen.findByText('From 0 to 5,000 g')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(grams('Feta'), { target: { value: '0' } });
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const feta = onSave.mock.calls[0]![0].ingredients[2]!;
    expect(feta).toMatchObject({ grams: 0, kcal: 0 });
  });

  it('Save sends the recipe with its steps as they came, then leaves', async () => {
    const { onSave, onSaved } = await view({ recipe: PILAF });
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(PILAF));
    const sent = onSave.mock.calls[0]![0];
    expect(sent.steps).toEqual(PILAF.steps);
    expect(sent).toMatchObject({
      name: PILAF.name,
      cookedG: 2100,
      servings: 6,
    });
  });

  it('a failed save is a toast; the editor stays', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('500');
    });
    const { onSaved } = await view({ recipe: PILAF, onSave });
    save();
    expect(
      await screen.findByText('Couldn’t save the recipe. Try again.'),
    ).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });

  it('offline: Save is disabled (E-10.5)', async () => {
    await view({ recipe: PILAF, online: false });
    const button = screen.getByRole('button', { name: 'Save' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('unsaved changes ask on leave; «Save and leave» saves without its own navigation (E-10.8)', async () => {
    const { onSave, onSaved } = await view({ recipe: PILAF });
    expect(isDirty()).toBe(false);
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Pilaf' },
    });
    expect(isDirty()).toBe(true);
    expect(await saveDirty()).toBe(true);
    expect(onSave.mock.calls[0]![0].name).toBe('Pilaf');
    expect(onSaved).not.toHaveBeenCalled();
    cleanup();
    expect(isDirty()).toBe(false);
  });

  it('a prefilled draft is unsaved from the start', async () => {
    const { steps, ...draft } = PILAF;
    await view({ draft: { ...draft, steps } });
    expect(isDirty()).toBe(true);
    expect(total('Total')).toBe('3,487');
  });

  it('a failed photo upload is a toast; the recipe saves without a photo (E-10.12)', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: { code: 'internal' } }, { status: 500 }),
    );
    const { onSave } = await view({ recipe: { ...SALAD, photoId: null } });
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
    });
    expect(
      await screen.findByText(
        'Couldn’t upload the photo. The recipe will be saved without it.',
      ),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].photoId).toBeNull();
  });

  it('«+ Ingredient» → «Enter manually» adds a row with the typed name', async () => {
    await view({ recipe: SALAD });
    fireEvent.click(screen.getByRole('button', { name: 'Ingredient' }));
    fireEvent.change(await screen.findByRole('searchbox'), {
      target: { value: 'Onion' },
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Enter “Onion” manually' }),
    );
    const name = (await screen.findByLabelText(/^Name ·/)) as HTMLInputElement;
    expect(name.value).toBe('Onion');
  });
});
