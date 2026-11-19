import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
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
  it('without AI offers no «Paste recipe text»', async () => {
    await openAdd(false);
    expect(screen.queryByText('Paste recipe text')).toBeNull();
  });

  it('with AI links «Paste recipe text» to /kitchen/paste', async () => {
    await openAdd(true);
    expect(
      screen.getByText('Paste recipe text').closest('a')?.getAttribute('href'),
    ).toBe('/kitchen/paste');
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
