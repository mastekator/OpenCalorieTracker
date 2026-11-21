import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { MEALS, RECIPES } from './fixtures';
import { KitchenView } from './KitchenScreen';

afterEach(cleanup);

const openAdd = async (ai: boolean) => {
  await renderLoaded(
    <I18nProvider>
      <KitchenView recipes={RECIPES} ai={ai} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add a recipe' }));
  await screen.findByText('Enter manually');
};

describe('KitchenView «+»', () => {
  it('without AI offers no «Recipe from text»', async () => {
    await openAdd(false);
    expect(screen.queryByText('Recipe from text')).toBeNull();
  });

  it('with AI links «Recipe from text» to /kitchen/paste, with a hint', async () => {
    await openAdd(true);
    expect(
      screen.getByText('Recipe from text').closest('a')?.getAttribute('href'),
    ).toBe('/kitchen/paste');
    expect(screen.getByText('AI picks out ingredients and grams')).toBeTruthy();
  });
});

describe('KitchenView empty list (OCT-433)', () => {
  const emptyButtons = async (ai: boolean) => {
    history.replaceState(null, '', '/kitchen');
    await renderLoaded(
      <I18nProvider>
        <KitchenView recipes={[]} ai={ai} />
      </I18nProvider>,
    );
    const empty = (await screen.findByText('New recipe')).parentElement!;
    return within(empty)
      .getAllByRole('button')
      .map((b) => b.textContent);
  };

  it('without AI keeps two buttons', async () => {
    expect(await emptyButtons(false)).toEqual(['New recipe', 'From a meal']);
  });

  it('with AI puts «Recipe from text» second; it opens /kitchen/paste', async () => {
    expect(await emptyButtons(true)).toEqual([
      'New recipe',
      'Recipe from text',
      'From a meal',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Recipe from text' }));
    expect(location.pathname).toBe('/kitchen/paste');
  });
});

describe('KitchenView «From a meal» (OCT-160 1.5)', () => {
  const mount = async (recipes = RECIPES, meals = MEALS) => {
    history.replaceState(null, '', '/kitchen');
    await renderLoaded(
      <I18nProvider>
        <KitchenView recipes={recipes} meals={meals} />
      </I18nProvider>,
    );
  };

  it('«+» → a meal opens the editor with it as a draft', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add a recipe' }));
    fireEvent.click(await screen.findByText('From a meal'));
    fireEvent.click(await screen.findByText('Lunch, Nov 13'));
    expect(location.pathname).toBe('/kitchen/new');
    expect(history.state).toMatchObject({
      draft: { name: 'Grilled chicken breast' },
      fromMeal: { mealType: 'lunch', localDate: '2026-11-13' },
    });
  });

  it('the empty list offers it too; no meals — says so', async () => {
    await mount([], []);
    fireEvent.click(screen.getByRole('button', { name: 'From a meal' }));
    expect(
      await screen.findByText('No meals in the last 30 days yet.'),
    ).toBeTruthy();
  });
});
