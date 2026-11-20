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
import { CHEESECAKE, PILAF, SALAD } from './fixtures';
import { RecipeView } from './RecipeScreen';

afterEach(cleanup);

const view = (props: Partial<Parameters<typeof RecipeView>[0]> = {}) => {
  const onDelete = vi.fn(async () => {});
  const onLog = vi.fn<Parameters<typeof RecipeView>[0]['onLog']>(
    async () => {},
  );
  const result = renderLoaded(
    <I18nProvider>
      <RecipeView
        recipe={PILAF}
        today="2026-11-19"
        online
        lighter
        onDelete={onDelete}
        onLog={onLog}
        {...props}
      />
    </I18nProvider>,
  );
  return { onDelete, onLog, result };
};

describe('RecipeView', () => {
  it('«Log a serving»: the portion sheet logs a serving straight to the diary', async () => {
    const { onLog, result } = view();
    await result;
    fireEvent.click(screen.getByRole('button', { name: 'Log a serving' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Log to / }));
    await waitFor(() => expect(onLog).toHaveBeenCalledOnce());
    expect(onLog.mock.calls[0]![0]).toMatchObject({
      grams: 350,
      source: 'recipe',
      recipeId: 1,
    });
  });

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

  it('ounces: meta, serving and ingredient weights in oz (AC-2.6)', async () => {
    await view({ units: 'us' }).result;
    expect(
      screen.getByText(
        /^6 servings of 12\.3.oz · cooked 74\.1.oz · logged yesterday$/,
      ),
    ).toBeTruthy();
    expect(screen.getAllByText('14.1 oz')).toHaveLength(2);
    expect(screen.getByText(/kcal · serving 12\.3.oz/)).toBeTruthy();
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

  it('without ingredients: «No ingredients listed», no «Whole», «Make it lighter» unavailable (AC-1.4, 1.6)', async () => {
    await view({ recipe: CHEESECAKE }).result;
    expect(screen.getByText(/^serving 150.g$/)).toBeTruthy();
    expect(screen.getByText('No ingredients listed')).toBeTruthy();
    expect(screen.getByText(/160.kcal · P 9 · F 8 · C 13/)).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Whole' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Serving' })).toBeTruthy();
    const lighter = screen.getByText('Make it lighter').closest('.list-row')!;
    expect(lighter.getAttribute('aria-disabled')).toBe('true');
    expect(lighter.getAttribute('href')).toBeNull();
    expect(lighter.textContent).toMatch(
      /Add ingredients so AI can suggest swaps/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    await screen.findByRole('button', { name: 'Delete recipe' });
    expect(
      screen.queryByRole('button', { name: 'Make it lighter' }),
    ).toBeNull();
  });

  it('«Add ingredients» opens the editor in the ingredient mode', async () => {
    await view({ recipe: CHEESECAKE }).result;
    fireEvent.click(screen.getByRole('button', { name: 'Add ingredients' }));
    expect(location.pathname).toBe('/kitchen/3/edit');
    expect(history.state).toMatchObject({ compose: true });
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
