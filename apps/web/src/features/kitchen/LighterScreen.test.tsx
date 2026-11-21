import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { LighterResponse, Recipe, RecipeInput } from '@oct/shared';
import { ApiError } from '../../api/client';
import { I18nProvider } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { ToastProvider } from '../../ui/Toast/Toast';
import { PILAF, SALAD } from './fixtures';
import { LighterView } from './LighterScreen';
import { PILAF_LIGHTER } from './lighterFixtures';

afterEach(cleanup);

const [tomatoes, cucumbers, feta, oil] = SALAD.ingredients as [
  Recipe['ingredients'][number],
  Recipe['ingredients'][number],
  Recipe['ingredients'][number],
  Recipe['ingredients'][number],
];

const view = async ({
  recipe = PILAF,
  load = vi.fn(async () => PILAF_LIGHTER),
}: {
  recipe?: Recipe;
  load?: () => Promise<LighterResponse>;
} = {}) => {
  const onSave = vi.fn(
    async (
      input: RecipeInput,
      base?: Pick<Recipe, 'id' | 'updatedAt'>,
    ): Promise<Recipe> => ({
      ...recipe,
      ...input,
      ingredients: input.ingredients.map((i) => ({
        ...i,
        unit: i.unit ?? 'g',
      })),
      id: base?.id ?? 99,
    }),
  );
  const onSaved = vi.fn();
  await renderLoaded(
    <I18nProvider>
      <ToastProvider>
        <LighterView
          recipe={recipe}
          online
          load={load}
          onSave={onSave}
          onSaved={onSaved}
        />
      </ToastProvider>
    </I18nProvider>,
  );
  return { load, onSave, onSaved };
};

describe('LighterView', () => {
  it('shows the variants: was → now, the saving per serving, the changes', async () => {
    await view();
    expect(screen.getByText(/^Now 581.kcal per serving\./)).toBeTruthy();
    expect(await screen.findByText('Option 1 of 2')).toBeTruthy();
    expect(screen.getByText('Option 2 of 2')).toBeTruthy();
    // 3 487 − 1 300 + 600 − 450 + 180 = 2 517 kcal / 6.
    expect(screen.getByText(/^420.kcal$/)).toBeTruthy();
    expect(screen.getByText('−162 per serving')).toBeTruthy();
    expect(
      screen.getByText(/^Pork shoulder 500.g → Skinless chicken thigh 500.g$/),
    ).toBeTruthy();
    expect(screen.getByText(/^Sunflower oil 50 → 20.g$/)).toBeTruthy();
    expect(screen.getByText(/^\+ Chickpeas 100.g$/)).toBeTruthy();
    expect(screen.getByText('Half the fat, still a meat pilaf')).toBeTruthy();
  });

  it('no servings: per 100 g', async () => {
    const variant = {
      ingredients: [tomatoes, cucumbers, feta],
      changes: [
        {
          change: 'removed' as const,
          from: 3,
          name: oil.name,
          grams: oil.grams,
          why: '',
        },
      ],
    };
    await view({ recipe: SALAD, load: async () => ({ variants: [variant] }) });
    expect(screen.getByText(/^Now \d+.kcal\/100.g\./)).toBeTruthy();
    // 534 kcal / 620 g → 354 kcal / 600 g.
    expect(await screen.findByText(/^−27.kcal\/100.g$/)).toBeTruthy();
    expect(screen.getByText('Without Olive oil')).toBeTruthy();
  });

  it('«Save as new» posts «{name} — light» with the new ingredients', async () => {
    const { onSave, onSaved } = await view();
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Save as new' }))[0]!,
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const [input, base] = onSave.mock.calls[0]!;
    expect(base).toBeUndefined();
    expect(input.name).toBe('Homemade pilaf — light');
    expect(input.ingredients).toEqual(PILAF_LIGHTER.variants[0]!.ingredients);
    // The copy goes without the original's photos, the step texts stay.
    expect(PILAF.photoId).not.toBeNull();
    expect(input.photoId).toBeNull();
    expect(input.steps).toEqual(
      PILAF.steps.map((s) => ({ ...s, photoId: null })),
    );
    expect(input.servings).toBe(6);
    // The cooked weight follows the raw one: 1 600 → 1 570 g raw.
    expect(input.cookedG).toBe(2060.6);
  });

  it('«Apply to this one» puts the variant into this recipe', async () => {
    const { onSave } = await view();
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Apply to this one' }))[1]!,
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const [input, base] = onSave.mock.calls[0]!;
    expect(base).toEqual(PILAF);
    expect(input.name).toBe(PILAF.name);
    expect(input.ingredients).toEqual(PILAF_LIGHTER.variants[1]!.ingredients);
    expect(input.photoId).toBe(PILAF.photoId);
    expect(input.steps).toEqual(PILAF.steps);
  });

  it('a failed save: a toast, the variants stay', async () => {
    const { onSave, onSaved } = await view();
    onSave.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Save as new' }))[0]!,
    );
    expect(
      await screen.findByText('Couldn’t save the recipe. Try again.'),
    ).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByText('Option 1 of 2')).toBeTruthy();
  });

  it('a recipe changed on another device: its own toast', async () => {
    const { onSave } = await view();
    onSave.mockRejectedValueOnce(new ApiError(409, 'recipe_changed'));
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Apply to this one' }))[0]!,
    );
    expect(
      await screen.findByText(
        'The recipe changed on another device — showing the latest version.',
      ),
    ).toBeTruthy();
  });

  it('error: the banner, «Try again» asks again (E-10.6)', async () => {
    const load = vi
      .fn<() => Promise<LighterResponse>>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(PILAF_LIGHTER);
    await view({ load });
    expect(await screen.findByText('Couldn’t suggest swaps')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Option 1 of 2')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('while asking: a status line', async () => {
    await view({ load: () => new Promise(() => {}) });
    expect(
      screen.getByText('Looking for lighter swaps…').closest('[role=status]'),
    ).toBeTruthy();
  });
});
