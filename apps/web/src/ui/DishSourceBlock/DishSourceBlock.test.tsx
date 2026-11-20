import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { DishSourceBlock } from './DishSourceBlock';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

const original = {
  grams: 140,
  kcal: 92.4,
  proteinG: 11.2,
  fatG: 2.8,
  carbsG: 5.6,
};
const render = (props: Partial<Parameters<typeof DishSourceBlock>[0]>) =>
  renderLoaded(
    <I18nProvider>
      <DishSourceBlock
        kind="barcode"
        code="4607012345677"
        original={original}
        {...props}
      />
    </I18nProvider>,
  );

describe('DishSourceBlock (OCT-313 2.6)', () => {
  it('credits Open Food Facts with a safe link to the product and numbers per 100 g', async () => {
    await render({});
    screen.getByText('Open Food Facts · by barcode');
    screen.getByText('Per 100 g: 66 kcal · P 8 · F 2 · C 4');
    const link = screen.getByRole('link', { name: 'Open in Open Food Facts' });
    expect(link.getAttribute('href')).toBe(
      'https://world.openfoodfacts.org/product/4607012345677',
    );
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('puts no invalid code into the link', async () => {
    await render({ code: '4607012345678' });
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('has no link for the label or an own product', async () => {
    await render({ kind: 'label' });
    screen.getByText('From the label in the photo · AI');
    expect(screen.queryByRole('link')).toBeNull();
    cleanup();
    await render({ kind: 'mine', savedAt: '2026-11-02T10:00:00Z' });
    screen.getByText('Your product · saved November 2, 2026');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
