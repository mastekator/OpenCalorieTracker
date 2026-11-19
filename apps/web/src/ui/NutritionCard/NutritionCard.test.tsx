import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { PILAF, SALAD } from '../../features/kitchen/fixtures';
import { NutritionCard, nutritionFor } from './NutritionCard';

afterEach(cleanup);

describe('nutritionFor (shared maths)', () => {
  it('pilaf: 581 kcal a 350 g serving, 166 per 100 g, 3 487 for 2 100 g whole', () => {
    const portion = nutritionFor(PILAF, 'portion');
    expect(Math.round(portion.n.kcal)).toBe(581);
    expect(portion.g).toBe(350);
    expect(Math.round(nutritionFor(PILAF, 'per100').n.kcal)).toBe(166);
    expect(nutritionFor(PILAF, 'whole')).toMatchObject({
      n: { kcal: 3487 },
      g: 2100,
    });
  });

  it('without servings a serving falls back to 100 g', () => {
    expect(nutritionFor(SALAD, 'portion')).toEqual(
      nutritionFor(SALAD, 'per100'),
    );
  });
});

describe('NutritionCard', () => {
  it('starts on Serving and switches to Whole', async () => {
    await renderLoaded(
      <I18nProvider>
        <NutritionCard {...PILAF} />
      </I18nProvider>,
    );
    expect(
      screen
        .getByRole('radio', { name: 'Serving' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.getByText('581')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Whole' }));
    expect(screen.getByText('3,487')).toBeTruthy();
    expect(screen.getByText(/whole 2,100/)).toBeTruthy();
  });

  it('without servings: 100 g, no Serving option', async () => {
    await renderLoaded(
      <I18nProvider>
        <NutritionCard {...SALAD} />
      </I18nProvider>,
    );
    expect(screen.queryByRole('radio', { name: 'Serving' })).toBeNull();
    expect(
      screen.getByRole('radio', { name: '100 g' }).getAttribute('aria-checked'),
    ).toBe('true');
  });
});
