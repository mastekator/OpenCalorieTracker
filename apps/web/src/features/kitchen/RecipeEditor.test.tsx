import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  gToOz,
  ozToG,
  type Product,
  type Recipe,
  type RecipeInput,
} from '@oct/shared';
import type { BarcodeResult } from '../../data/products';
import { ApiError } from '../../api/client';
import { isDirty, saveDirty } from '../../app/dirty';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { ToastProvider } from '../../ui/Toast/Toast';
import { CHEESECAKE, PILAF, SALAD } from './fixtures';
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
    fireEvent.change(cooked, { target: { value: '13020' } });
    expect(screen.getByText(/в 21 раз тяжелее/)).toBeTruthy();
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

  it('Save sends the recipe with its steps (PUT), then leaves', async () => {
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

  it('ounces: shown in oz, an untouched recipe saves its grams unchanged (AC-2.6)', async () => {
    const { onSave } = await view({ recipe: PILAF, units: 'us' });
    const rice = screen.getByLabelText(
      'Long-grain rice, ounces',
    ) as HTMLInputElement;
    expect(rice.value).toBe(String(gToOz(400)));
    expect(cookedField().value).toBe(String(gToOz(2100)));
    expect(screen.getByText('ounces · kcal')).toBeTruthy();
    expect(isDirty()).toBe(false);
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const sent = onSave.mock.calls[0]![0];
    expect(sent.cookedG).toBe(2100);
    expect(sent.ingredients.map((i) => i.grams)).toEqual(
      PILAF.ingredients.map((i) => i.grams),
    );
  });

  it('ounces: typed oz go to grams without rounding in oz (AC-2.6)', async () => {
    const { onSave } = await view({ recipe: PILAF, units: 'us' });
    fireEvent.change(screen.getByLabelText('Long-grain rice, ounces'), {
      target: { value: '10.25' },
    });
    fireEvent.change(cookedField(), { target: { value: '70' } });
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const sent = onSave.mock.calls[0]![0];
    expect(sent.ingredients[0]!.grams).toBe(ozToG(10.25));
    expect(sent.cookedG).toBe(ozToG(70));
  });

  it('ounces: the weigh hint and the range error are in oz', async () => {
    await view({ recipe: SALAD, units: 'us' });
    expect(screen.getByText(/raw weight: 21\.9 oz/)).toBeTruthy();
    const first = screen.getAllByLabelText(/, ounces$/)[0]!;
    fireEvent.change(first, { target: { value: '200' } });
    expect(screen.getByText('From 0 to 176.4 oz')).toBeTruthy();
  });

  it('an ml ingredient shows ml or fl oz and keeps its unit on save (ADR-0038)', async () => {
    const oil = { ...PILAF.ingredients[4]!, unit: 'ml' as const };
    const recipe = {
      ...PILAF,
      ingredients: [PILAF.ingredients[0]!, oil],
    };
    const { onSave } = await view({ recipe, units: 'us' });
    const field = screen.getByLabelText(
      'Sunflower oil, fl oz',
    ) as HTMLInputElement;
    expect(field.value).toBe('1.7');
    expect(screen.getByText('Milliliters count as grams.')).toBeTruthy();
    expect(isDirty()).toBe(false);
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const sent = onSave.mock.calls[0]![0].ingredients;
    expect(sent[1]).toMatchObject({ grams: 50, unit: 'ml' });
    expect(sent[0]).not.toHaveProperty('unit');
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

  it('saves from the version it opened; a newer one elsewhere is its own toast', async () => {
    const onSave = vi.fn(async () => {
      throw new ApiError(409, 'recipe_changed');
    });
    await view({ recipe: PILAF, onSave });
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Pilaf' },
    });
    save();
    expect(
      await screen.findByText(
        'The recipe changed on another device — showing the latest version.',
      ),
    ).toBeTruthy();
    expect(onSave).toHaveBeenCalledWith(expect.anything(), PILAF);
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

  it('a draft from a meal says which meal (OCT-160 3.7)', async () => {
    const { steps, ...draft } = PILAF;
    await view({
      draft: { ...draft, steps },
      fromMeal: { mealType: 'lunch', localDate: '2026-11-13' },
    });
    expect(screen.getByText('From lunch, Nov 13')).toBeTruthy();
    expect(screen.getByText(/^Dishes became ingredients/)).toBeTruthy();
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

  describe('barcode in «Enter manually» (ADR-0040 §1)', () => {
    const COOKIES: Product = {
      code: '4006381333931',
      name: 'Sugar cookies',
      brand: null,
      kcal100: 440,
      protein100: 6,
      fat100: 16,
      carbs100: 68,
      per: 'g',
      servingG: null,
      servingText: null,
      packG: 400,
    };
    const addByCode = async (result: BarcodeResult, name = 'Cookies') => {
      const lookup = vi.fn(async () => result);
      const out = await view({ recipe: SALAD, lookup });
      fireEvent.click(screen.getByRole('button', { name: 'Ingredient' }));
      fireEvent.change(await screen.findByRole('searchbox'), {
        target: { value: name },
      });
      fireEvent.click(
        await screen.findByRole('button', { name: `Enter “${name}” manually` }),
      );
      const field = await screen.findByLabelText('Barcode');
      fireEvent.change(field, { target: { value: COOKIES.code } });
      fireEvent.keyDown(field, { key: 'Enter' });
      await waitFor(() => expect(lookup).toHaveBeenCalledWith(COOKIES.code));
      return out;
    };
    const share = () =>
      document.querySelector('.ingredient-row__share')?.textContent;
    const sent = async (onSave: ReturnType<typeof vi.fn>) => {
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
      return (onSave.mock.calls[0]![0] as RecipeInput).ingredients.at(-1)!;
    };

    it('found: «How much you used», a barcode row with its share, sent with barcode and pack', async () => {
      const { onSave } = await addByCode({
        product: COOKIES,
        from: 'off',
        off: 'found',
      });
      await screen.findByText('Found in Open Food Facts — check the amount.');
      expect(screen.getByText('How much you used')).toBeTruthy();
      fireEvent.click(screen.getByRole('radio', { name: 'Package' }));
      fireEvent.click(screen.getByRole('button', { name: '½' }));
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      await waitFor(() => expect(share()).toMatch(/^½\spack · 200\sg$/));
      expect(screen.getByText('barcode')).toBeTruthy();
      expect((grams('Cookies') as HTMLInputElement).value).toBe('200');
      expect(await sent(onSave)).toMatchObject({
        name: 'Cookies',
        grams: 200,
        kcal: 880,
        source: 'barcode',
        barcode: COOKIES.code,
        pack: { amount: { mode: 'pack', value: 0.5 } },
      });
    });

    it('a tap opens the share in the dish sheet; grams edited by hand drop the caption', async () => {
      await addByCode({ product: COOKIES, from: 'mine', off: 'skipped' });
      await screen.findByText('Found your product — check the amount.');
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      await waitFor(() => expect(share()).toBeTruthy());
      // A tap opens the dish sheet with the same share block (mockup 2.3).
      fireEvent.click(screen.getByRole('button', { name: /^Cookies/ }));
      await screen.findByText('How much you used');
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      fireEvent.change(grams('Cookies'), { target: { value: '150' } });
      expect(share()).toBeUndefined();
    });

    it('not found: the own-product form, a manual row sent with the barcode', async () => {
      const { onSave } = await addByCode({
        product: null,
        from: null,
        off: 'missing',
      });
      await screen.findByText(
        'Not in your products or Open Food Facts. Fill it in — we’ll remember the product with this barcode.',
      );
      fireEvent.change(screen.getByLabelText(/^Weight/), {
        target: { value: '180' },
      });
      fireEvent.change(screen.getByLabelText(/^Calories ·/), {
        target: { value: '230' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      await waitFor(() => expect(grams('Cookies')).toBeTruthy());
      expect(share()).toBeUndefined();
      expect(screen.queryByText('barcode')).toBeNull();
      const row = await sent(onSave);
      expect(row).toMatchObject({ source: 'manual', barcode: COOKIES.code });
      expect(row).not.toHaveProperty('pack');
    });

    it('offline: a product saved on this device is found (E1)', async () => {
      const { onSave } = await addByCode({
        product: COOKIES,
        from: 'local',
        off: 'offline',
      });
      await screen.findByText('Found on this phone — check the amount.');
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(await sent(onSave)).toMatchObject({
        source: 'barcode',
        barcode: COOKIES.code,
      });
    });
  });

  describe('steps', () => {
    const texts = () =>
      screen
        .getAllByRole('textbox', { name: /^Step \d+$/ })
        .map((e) => (e as HTMLTextAreaElement).value.slice(0, 4));
    const menu = (i: number) =>
      fireEvent.click(screen.getByRole('button', { name: `Move step ${i}` }));
    const action = (name: string) =>
      screen.getByRole('button', { name }) as HTMLButtonElement;

    it('«Move up / Move down» reorder; the first can’t go up, the last can’t go down', async () => {
      const { onSave } = await view({ recipe: PILAF });
      expect(texts()).toEqual(['Dice', 'Heat', 'Add ']);
      menu(1);
      expect(action('Move up').disabled).toBe(true);
      fireEvent.click(action('Move down'));
      expect(texts()).toEqual(['Heat', 'Dice', 'Add ']);
      menu(3);
      expect(action('Move down').disabled).toBe(true);
      fireEvent.click(action('Move up'));
      expect(texts()).toEqual(['Heat', 'Add ', 'Dice']);
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
      expect(onSave.mock.calls[0]![0].steps.map((s) => s.photoId)).toEqual([
        'spaghetti.jpg',
        null,
        null,
      ]);
    });

    it('dragging the handle down past two steps moves the step to the end', async () => {
      // jsdom has no layout: each step is 100 px tall, in DOM order.
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
        function (this: Element) {
          const i = [...(this.parentElement?.children ?? [])].indexOf(this);
          return { top: i * 100, height: 100 } as DOMRect;
        },
      );
      await view({ recipe: PILAF });
      const grip = screen.getByRole('button', { name: 'Move step 1' });
      fireEvent.pointerDown(grip, { button: 0, clientY: 50 });
      for (const y of [120, 180, 260])
        fireEvent.pointerMove(window, { clientY: y });
      fireEvent.pointerUp(window);
      fireEvent.click(grip);
      expect(texts()).toEqual(['Heat', 'Add ', 'Dice']);
      // The click that ends a drag opens no menu.
      expect(screen.queryByRole('button', { name: 'Move up' })).toBeNull();
      vi.restoreAllMocks();
    });

    it('«+ Step» adds a step that goes into the POST; a blank one and a deleted one do not', async () => {
      const { onSave } = await view({ recipe: SALAD });
      fireEvent.click(screen.getByRole('button', { name: 'Step' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Step 1' }), {
        target: { value: '  Chop everything  ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Step' }));
      fireEvent.click(screen.getByRole('button', { name: 'Step' }));
      menu(3);
      fireEvent.click(action('Delete step'));
      expect(texts()).toHaveLength(2);
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
      expect(onSave.mock.calls[0]![0].steps).toEqual([
        { text: 'Chop everything', photoId: null },
      ]);
    });

    it('a step with a photo and no text blocks Save, keeps the photo, and saves once it has text', async () => {
      const { onSave } = await view({ recipe: PILAF });
      const step = screen.getByRole('textbox', { name: 'Step 2' });
      expect(step.getAttribute('placeholder')).toBe('What to do in this step');
      fireEvent.change(step, { target: { value: '  ' } });
      save();
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toBe('Add text to step 2');
      expect(document.activeElement).toBe(step);
      expect(step.getAttribute('aria-invalid')).toBe('true');
      expect(step.getAttribute('aria-describedby')).toBe(alert.id);
      expect(onSave).not.toHaveBeenCalled();
      fireEvent.change(step, { target: { value: 'Heat the pan' } });
      expect(screen.queryByRole('alert')).toBeNull();
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
      expect(onSave.mock.calls[0]![0].steps[1]).toEqual({
        text: 'Heat the pan',
        photoId: 'spaghetti.jpg',
      });
    });

    it('a step photo is uploaded and sent with the step', async () => {
      vi.stubGlobal('fetch', async () => Response.json({ photoId: 'p-step' }));
      const { onSave } = await view({ recipe: PILAF });
      const input = screen
        .getByRole('button', { name: 'Add a photo to step 1' })
        .parentElement!.querySelector('input[type=file]')!;
      fireEvent.change(input, {
        target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
      });
      await screen.findByRole('button', {
        name: 'Replace the photo of step 1',
      });
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
      expect(onSave.mock.calls[0]![0].steps[0]!.photoId).toBe('p-step');
    });

    it('a failed step photo is a toast; the step saves without it (E-10.12)', async () => {
      vi.stubGlobal('fetch', async () =>
        Response.json({ error: { code: 'internal' } }, { status: 500 }),
      );
      const { onSave } = await view({ recipe: PILAF });
      const input = screen
        .getByRole('button', { name: 'Add a photo to step 1' })
        .parentElement!.querySelector('input[type=file]')!;
      fireEvent.change(input, {
        target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
      });
      expect(
        await screen.findByText(
          'Couldn’t upload the photo. The recipe will be saved without it.',
        ),
      ).toBeTruthy();
      await waitFor(() => expect(action('Save').disabled).toBe(false));
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
      expect(onSave.mock.calls[0]![0].steps[0]).toEqual(PILAF.steps[0]);
    });

    it('no «+ Step» at 30 steps', async () => {
      const steps = Array.from({ length: 30 }, (_, i) => ({
        text: `s${i}`,
        photoId: null,
      }));
      await view({ recipe: { ...SALAD, steps } });
      expect(screen.queryByRole('button', { name: 'Step' })).toBeNull();
    });
  });
  describe('AI draft (OCT-160 §9, AC-6.4)', () => {
    const salt = {
      name: 'Salt',
      grams: 0,
      kcal: 0,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
      source: 'ai' as const,
    };
    const draft: RecipeInput = {
      ...SALAD,
      ingredients: [
        ...SALAD.ingredients.map((i) => ({ ...i, source: 'ai' as const })),
        salt,
      ],
    };
    const zero = /^“Salt” — couldn’t estimate, enter it or keep 0.g$/;

    it('shows the notice, «estimate» badges and marks the unsure 0 g row', async () => {
      await view({ draft, ai: { unsure: [4] } });
      expect(screen.getByText('AI draft')).toBeTruthy();
      expect(screen.getAllByText('estimate')).toHaveLength(5);
      expect(screen.getByText(zero)).toBeTruthy();
    });

    it('the mark follows its row when a row above is deleted', async () => {
      await view({ draft, ai: { unsure: [4] } });
      fireEvent.click(screen.getByRole('button', { name: /^Tomatoes/ }));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Delete dish' }),
      );
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /^Tomatoes/ })).toBeNull(),
      );
      expect(screen.getByText(zero)).toBeTruthy();
    });

    it('a grams edit clears the mark; nothing of it is saved', async () => {
      const { onSave } = await view({ draft, ai: { unsure: [4] } });
      fireEvent.change(grams('Salt'), { target: { value: '5' } });
      fireEvent.change(grams('Salt'), { target: { value: '0' } });
      expect(screen.queryByText(zero)).toBeNull();
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
      const sent = onSave.mock.calls[0]![0];
      expect(sent.ingredients[4]).toEqual(salt);
      expect(Object.keys(sent).sort()).toEqual([
        'cookedG',
        'ingredients',
        'name',
        'note',
        'per100',
        'photoId',
        'servingG',
        'servings',
        'steps',
      ]);
    });

    it('without `ai` there is no notice', async () => {
      await view({ draft });
      expect(screen.queryByText('AI draft')).toBeNull();
      expect(screen.queryByText(zero)).toBeNull();
    });
  });

  describe('calories per 100 g (OCT-356, ADR-0035 §2)', () => {
    const mode = (name: string) =>
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(name) }));
    const field = (label: string) =>
      screen.getByLabelText(label) as HTMLInputElement;
    const kcal100 = () => field('Calories per 100 g required');
    const type = (label: string, value: string) =>
      fireEvent.change(field(label), { target: { value } });

    it('a saved recipe without ingredients opens in the mode and saves unchanged', async () => {
      const { onSave } = await view({ recipe: CHEESECAKE });
      expect(
        screen
          .getByRole('radio', { name: /Calories per 100.g/ })
          .getAttribute('aria-checked'),
      ).toBe('true');
      expect(kcal100().value).toBe('160');
      expect(field('Serving size, g').value).toBe('150');
      expect(screen.getByText('240')).toBeTruthy(); // the serving card
      expect(screen.queryByText('Cooked weight')).toBeNull();
      expect(isDirty()).toBe(false);
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
      expect(onSave.mock.calls[0]![0]).toMatchObject({
        ingredients: [],
        cookedG: null,
        servings: null,
        per100: CHEESECAKE.per100,
        servingG: 150,
      });
    });

    it('a new recipe: kcal only, blank macros as 0, no serving', async () => {
      const { onSave } = await view();
      type('Name', 'Cake');
      mode('Calories per 100.g');
      expect(screen.queryByRole('alertdialog')).toBeNull(); // nothing to lose
      type('Calories per 100 g required', '160');
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
      expect(onSave.mock.calls[0]![0]).toMatchObject({
        ingredients: [],
        per100: { kcal: 160, proteinG: 0, fatG: 0, carbsG: 0 },
        servingG: null,
      });
    });

    it('field errors block Save and focus the first one (E-1.a)', async () => {
      const { onSave } = await view({ draft: { ...CHEESECAKE } });
      type('Calories per 100 g required', '1200');
      expect(screen.getByText('Calories per 100 g must be 0–900')).toBeTruthy();
      type('Calories per 100 g required', '');
      type('Protein', '60');
      type('Fat', '40');
      type('Carbs', '30');
      expect(
        screen.getByText(
          'Protein + fat + carbs can’t exceed 100 g per 100 g. Now 130 g.',
        ),
      ).toBeTruthy();
      expect(field('Fat').getAttribute('aria-invalid')).toBe('true');
      type('Serving size, g', '0');
      expect(screen.getByText(/More than 0, up to 5,000/)).toBeTruthy();
      save();
      // Blank kcal is shown only after Save.
      expect(screen.getByText('Calories per 100 g must be 0–900')).toBeTruthy();
      expect(document.activeElement).toBe(kcal100());
      expect(onSave).not.toHaveBeenCalled();
    });

    it('by ingredients → per 100 g asks, then pre-fills from the calculation (AC-1.5)', async () => {
      const { onSave } = await view({ recipe: PILAF });
      mode('Calories per 100.g');
      const dialog = screen.getByRole('alertdialog');
      expect(dialog.textContent).toMatch(
        /The 8 ingredients won’t be saved\..*166\u00a0kcal/,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
      expect(kcal100().value).toBe('166');
      expect(field('Serving size, g').value).toBe('350');
      expect(screen.queryByText('Cooked weight')).toBeNull();
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
      const sent = onSave.mock.calls[0]![0];
      expect(sent).toMatchObject({
        ingredients: [],
        cookedG: null,
        servings: null,
        servingG: 350,
      });
      expect(sent.per100!.kcal).toBe(166);
    });

    it('«Stay» changes neither the mode nor the ingredients', async () => {
      await view({ recipe: PILAF });
      mode('Calories per 100.g');
      fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
      expect(
        screen
          .getByRole('radio', { name: 'By ingredients' })
          .getAttribute('aria-checked'),
      ).toBe('true');
      expect(grams('Long-grain rice')).toBeTruthy();
      expect(total('Serving')).toBe('581');
      expect(isDirty()).toBe(false);
    });

    it('per 100 g → by ingredients: an empty list and the old values as a note (AC-1.5)', async () => {
      await view({ recipe: CHEESECAKE });
      mode('By ingredients');
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.getByText('It was 160 kcal per 100 g')).toBeTruthy();
      expect(isDirty()).toBe(true);
      save();
      expect(screen.getByText('Add at least one ingredient')).toBeTruthy();
    });

    it('per 100 g → by ingredients: an empty state instead of totals and yield, until the first ingredient', async () => {
      await view({ recipe: CHEESECAKE });
      mode('By ingredients');
      expect(screen.getByText('No ingredients yet')).toBeTruthy();
      expect(screen.queryByText('Serving', { selector: 'dt' })).toBeNull();
      expect(screen.queryByText('Yield')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Ingredient' }));
      fireEvent.change(await screen.findByRole('searchbox'), {
        target: { value: 'Quark' },
      });
      fireEvent.click(
        await screen.findByRole('button', { name: 'Enter “Quark” manually' }),
      );
      fireEvent.change(await screen.findByLabelText(/^Weight/), {
        target: { value: '500' },
      });
      fireEvent.change(screen.getByLabelText(/^Calories ·/), {
        target: { value: '104' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));

      await screen.findByText('Yield');
      expect(screen.queryByText('No ingredients yet')).toBeNull();
      expect(total('Total')).toBe('520');
    });

    it('«Add ingredients» opens by ingredients, the values as a note', async () => {
      await view({ recipe: CHEESECAKE, compose: true });
      expect(
        screen
          .getByRole('radio', { name: 'By ingredients' })
          .getAttribute('aria-checked'),
      ).toBe('true');
      expect(screen.getByText(/P 9 · F 8 · C 13/)).toBeTruthy();
    });
  });
});
