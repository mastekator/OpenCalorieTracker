import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { PILAF, SALAD } from './fixtures';
import { RecipeView } from './RecipeScreen';

afterEach(cleanup);

const view = (props: Partial<Parameters<typeof RecipeView>[0]> = {}) => {
  const onDelete = vi.fn(async () => {});
  const result = renderLoaded(
    <I18nProvider>
      <RecipeView
        recipe={PILAF}
        today="2026-11-19"
        online
        onDelete={onDelete}
        {...props}
      />
    </I18nProvider>,
  );
  return { onDelete, result };
};

describe('RecipeView', () => {
  it('shows meta, ingredients with 0 g not counted, and steps', async () => {
    await view().result;
    expect(
      screen.getByText(
        /^6 servings of 350.g · cooked 2,100.g · logged yesterday$/,
      ),
    ).toBeTruthy();
    expect(screen.getAllByText('not counted in kcal')).toHaveLength(2);
    expect(screen.getByText('Ingredients · 8')).toBeTruthy();
    expect(screen.getByText('Steps · 3')).toBeTruthy();
  });

  it('no steps: no block; no servings: no serving meta', async () => {
    await view({ recipe: SALAD }).result;
    expect(screen.queryByText(/Steps/)).toBeNull();
    expect(screen.queryByText(/servings of/)).toBeNull();
  });

  it('deletes only after the confirmation (E-10.4)', async () => {
    const { onDelete, result } = view();
    await result;
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete recipe' }),
    );
    expect(onDelete).not.toHaveBeenCalled();
    expect(await screen.findByText('Delete “Homemade pilaf”?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
  });

  it('offline: delete is disabled', async () => {
    await view({ online: false }).result;
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const del = await screen.findByRole('button', { name: 'Delete recipe' });
    expect((del as HTMLButtonElement).disabled).toBe(true);
  });
});
