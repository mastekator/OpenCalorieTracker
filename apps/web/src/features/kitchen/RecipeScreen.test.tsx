import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
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
        lighter
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

  it('«Make it lighter»: the row and the «⋯» item with AI, none without', async () => {
    const { result } = view();
    await result;
    expect(
      screen
        .getByRole('link', { name: /Make it lighter/ })
        .getAttribute('href'),
    ).toBe('/kitchen/1/lighter');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(
      await screen.findByRole('button', { name: 'Make it lighter' }),
    ).toBeTruthy();
    cleanup();
    await view({ lighter: false }).result;
    expect(screen.queryByText('Make it lighter')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    await screen.findByRole('button', { name: 'Delete recipe' });
    expect(
      screen.queryByRole('button', { name: 'Make it lighter' }),
    ).toBeNull();
  });

  it('a step photo that fails to load is left out', async () => {
    await view().result;
    const img = document.querySelector('.recipe__step-photo')!;
    fireEvent.error(img);
    expect(document.querySelector('.recipe__step-photo')).toBeNull();
    expect(screen.getByText(/^Heat the oil/)).toBeTruthy();
  });

  it('the navbar title waits until the page title scrolls under it (2.1, 2.2)', async () => {
    let fire: (top: number) => void = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          fire = (top) =>
            cb(
              [
                {
                  isIntersecting: top >= 0,
                  boundingClientRect: { top },
                  rootBounds: { top: 0 },
                } as unknown as IntersectionObserverEntry,
              ],
              this as unknown as IntersectionObserver,
            );
        }
        observe() {}
        disconnect() {}
      },
    );
    await view().result;
    const title = screen.getByRole('heading', { level: 1 });
    expect(title.className).toContain('navbar__title--hidden');
    act(() => fire(-40));
    expect(title.className).not.toContain('navbar__title--hidden');
    act(() => fire(20));
    expect(title.className).toContain('navbar__title--hidden');
    vi.unstubAllGlobals();
  });

  it('macros carry their colour dots', async () => {
    await view().result;
    expect(
      document.querySelectorAll('.nutrition-card__macros .macro__dot'),
    ).toHaveLength(3);
  });
});
