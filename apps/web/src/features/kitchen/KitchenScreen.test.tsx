import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { RECIPES } from './fixtures';
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
