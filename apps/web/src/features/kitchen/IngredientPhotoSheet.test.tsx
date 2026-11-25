import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type {
  Product,
  Recipe,
  RecipeInput,
  RecognizedIngredient,
} from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { ToastProvider } from '../../ui/Toast/Toast';
import { SALAD } from './fixtures';
import { RecipeEditor } from './RecipeEditor';

// jsdom has no canvas: the photo is taken as is.
vi.mock('../meals/prepareImage', async (original) => ({
  ...(await original<typeof import('../meals/prepareImage')>()),
  prepareImage: async (file: Blob) => file,
}));

const CURD: Product = {
  code: '4601234567890',
  name: 'Cottage cheese 5%',
  brand: null,
  kcal100: 121,
  protein100: 17,
  fat100: 5,
  carbs100: 3,
  per: 'g',
  servingG: null,
  servingText: null,
  packG: 400,
};
const per100 = (kcal: number) => ({
  kcal,
  proteinG: 10,
  fatG: 1,
  carbsG: 70,
});
const FLOUR: RecognizedIngredient = {
  name: 'Wheat flour',
  grams: 512,
  kcal: 1741,
  proteinG: 51.2,
  fatG: 5.1,
  carbsG: 358.4,
  per100: per100(340),
  weight: 'scale',
  source: 'ai',
};
const CHEESE: RecognizedIngredient = {
  name: CURD.name!,
  grams: 400,
  kcal: 484,
  proteinG: 68,
  fatG: 20,
  carbsG: 12,
  per100: per100(121),
  weight: 'barcode',
  source: 'barcode',
  barcode: CURD.code,
  product: CURD,
};
const CARROTS: RecognizedIngredient = {
  name: 'Carrots',
  grams: 360,
  kcal: 126,
  proteinG: 3.2,
  fatG: 0.4,
  carbsG: 24.8,
  per100: per100(35),
  weight: 'estimate',
  source: 'ai',
  edible: { grossG: 400, pct: 90, source: 'ref', key: 'carrot' },
};

type Reply = () => Response | Promise<Response>;
let calls: string[];
const stub = (recognize: Reply[]) => {
  let n = 0;
  vi.stubGlobal('fetch', async (req: Request | string) => {
    const url = typeof req === 'string' ? req : req.url;
    calls.push(url);
    if (url.endsWith('/api/photos')) return Response.json({ photoId: 'p1' });
    if (url.includes('mode=ingredients')) return recognize[n++]!();
    throw new Error(`unexpected ${url}`);
  });
};
const found =
  (...items: RecognizedIngredient[]) =>
  () =>
    Response.json({ items });

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  URL.createObjectURL = () => 'blob:photo';
  URL.revokeObjectURL = () => {};
  calls = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const view = async (online = true) => {
  const onSave = vi.fn<(input: RecipeInput) => Promise<Recipe>>(
    async () => SALAD,
  );
  await renderLoaded(
    <I18nProvider>
      <ToastProvider>
        <RecipeEditor
          recipe={SALAD}
          online={online}
          photo
          search={async () => []}
          onSave={onSave}
          onSaved={() => {}}
        />
      </ToastProvider>
    </I18nProvider>,
  );
  return onSave;
};

const shoot = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Ingredient' }));
  fireEvent.click(
    await screen.findByRole('button', { name: /Photograph the ingredients/ }),
  );
  // The last file input is the products one; the first is the recipe photo.
  const inputs =
    document.querySelectorAll<HTMLInputElement>('input[type=file]');
  fireEvent.change(inputs[inputs.length - 1]!, {
    target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
  });
};

describe('Photograph the ingredients (ADR-0040 §6)', () => {
  it('«Add · N» appends the found rows with barcode, pack and edible, keeping the recipe’s own (AC-C1)', async () => {
    stub([found(FLOUR, CHEESE, CARROTS)]);
    const onSave = await view();
    await shoot();
    expect(await screen.findByText('Wheat flour')).toBeTruthy();
    expect(screen.getByText('from scale')).toBeTruthy();
    expect(screen.getByText('barcode')).toBeTruthy();
    expect(screen.getByText('estimate')).toBeTruthy();
    expect(screen.getByText(/edible 360\sg · 90%/)).toBeTruthy();

    // «Whole» in the carrots' sheet: the full gross weight, the user's share.
    fireEvent.click(screen.getByText('Carrots'));
    fireEvent.click(await screen.findByRole('radio', { name: 'Whole' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add · 3' }));

    await waitFor(() =>
      expect(screen.queryByText('Ingredients from photo')).toBeNull(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const rows = onSave.mock.calls[0]![0].ingredients;
    expect(rows.map((r) => r.name)).toEqual([
      ...SALAD.ingredients.map((i) => i.name),
      'Wheat flour',
      CURD.name,
      'Carrots',
    ]);
    expect(rows.slice(0, 4)).toEqual(
      SALAD.ingredients.map(({ name, grams, kcal, source }) =>
        expect.objectContaining({ name, grams, kcal, source }),
      ),
    );
    expect(rows[4]).toMatchObject({ grams: 512, source: 'ai' });
    expect(rows[4]).not.toHaveProperty('edible');
    expect(rows[5]).toMatchObject({
      grams: 400,
      source: 'barcode',
      barcode: CURD.code,
      pack: { amount: { mode: 'pack', value: 1 } },
    });
    expect(rows[6]).toMatchObject({
      grams: 400,
      source: 'ai',
      edible: { key: 'carrot', pct: 100 },
    });
  });

  it('«Remove from list» keeps a row out of the recipe', async () => {
    stub([found(FLOUR, CARROTS)]);
    await view();
    await shoot();
    fireEvent.click(await screen.findByText('Wheat flour'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Remove from list' }),
    );
    expect(await screen.findByRole('button', { name: 'Add · 1' })).toBeTruthy();
    expect(screen.queryByText('Wheat flour')).toBeNull();
  });

  it('nothing found: «Take another» and «Enter manually»', async () => {
    stub([found()]);
    await view();
    await shoot();
    expect(
      await screen.findByText('No ingredients found in the photo'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enter manually' }));
    expect(await screen.findByText('Ingredient, manually')).toBeTruthy();
  });

  it('an AI error: «Try again» uploads the photo again, the recipe is untouched (E2)', async () => {
    stub([
      () => Response.json({ error: { code: 'ai_failed' } }, { status: 502 }),
      found(FLOUR),
    ]);
    await view();
    await shoot();
    expect(
      await screen.findByText('Couldn’t recognize the photo'),
    ).toBeTruthy();
    expect(screen.getByText('Tomatoes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Add · 1' })).toBeTruthy();
    expect(calls.filter((u) => u.endsWith('/api/photos'))).toHaveLength(2);
  });

  it('offline: the row is greyed out with «Needs internet» and does nothing (E1)', async () => {
    stub([]);
    await view(false);
    fireEvent.click(screen.getByRole('button', { name: 'Ingredient' }));
    const row = await screen.findByRole('button', {
      name: /Photograph the ingredients/,
    });
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Needs internet')).toBeTruthy();
    const input = [
      ...document.querySelectorAll<HTMLInputElement>('input[type=file]'),
    ].at(-1)!;
    const click = vi.spyOn(input, 'click');
    fireEvent.click(row);
    expect(click).not.toHaveBeenCalled();
  });
});
