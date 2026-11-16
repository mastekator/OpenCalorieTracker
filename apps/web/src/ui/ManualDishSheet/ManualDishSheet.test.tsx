import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { Units } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { BASIS_KEY, ManualDishSheet } from './ManualDishSheet';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
});
afterEach(cleanup);

async function setup(units: Units = 'metric') {
  const onAdd = vi.fn();
  await renderLoaded(
    <I18nProvider>
      <ManualDishSheet units={units} onAdd={onAdd} onClose={() => {}} />
    </I18nProvider>,
  );
  const type = (label: RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const add = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  return { onAdd, type, add };
}

const fill = (type: (l: RegExp, v: string) => void, kcal = '100') => {
  type(/^Name/, 'Cottage cheese');
  type(/^Weight/, '250');
  type(/^Calories ·/, kcal);
};

describe('ManualDishSheet', () => {
  it('requires the name, weight and calories (AC-5.2)', async () => {
    const { onAdd, add } = await setup();
    add();
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a name')).toBeTruthy();
    expect(screen.getByText('Weight from 1 to 5000 g')).toBeTruthy();
    expect(screen.getByText('Enter calories')).toBeTruthy();
    expect(screen.queryByText('Enter a number, like 12.5')).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText(/^Name/));
  });

  it('per 100 g: 100 kcal × 250 g = 250 kcal, empty macros are 0 (AC-5.3)', async () => {
    const { onAdd, type, add } = await setup();
    fill(type);
    expect(screen.getByText('Total for 250 g: 250 kcal')).toBeTruthy();
    add();
    expect(onAdd).toHaveBeenCalledWith({
      name: 'Cottage cheese',
      grams: 250,
      kcal: 250,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
    });
  });

  it('per serving: 250 g / 400 kcal = 400 kcal, and the choice is remembered (AC-5.3)', async () => {
    const { onAdd, type, add } = await setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Per serving' }));
    fill(type, '400');
    expect(screen.queryByText(/^Total for/)).toBeNull();
    add();
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ grams: 250, kcal: 400 });
    expect(localStorage.getItem(BASIS_KEY)).toBe('portion');
    cleanup();
    await setup();
    expect(
      screen
        .getByRole('radio', { name: 'Per serving' })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('takes «12,5» and «12.5», «abc» is an error (AC-5.4)', async () => {
    const { onAdd, type, add } = await setup();
    fill(type, '12,5');
    type(/^Protein/, '12.5');
    type(/^Fat/, 'abc');
    fireEvent.blur(screen.getByLabelText(/^Fat/));
    expect(screen.getByText('Enter a number, like 12.5')).toBeTruthy();
    add();
    expect(onAdd).not.toHaveBeenCalled();
    type(/^Fat/, '');
    add();
    // 12.5 kcal and 12.5 g protein per 100 g × 250 g
    expect(onAdd.mock.calls[0]![0]).toMatchObject({
      kcal: 31.3,
      proteinG: 31.3,
    });
  });

  it('empty kcal asks for calories, «abc» for a number, a number clears it', async () => {
    const { type } = await setup();
    const kcal = () => screen.getByLabelText(/^Calories ·/);
    fireEvent.blur(kcal());
    expect(screen.getByText('Enter calories')).toBeTruthy();
    type(/^Calories ·/, 'abc');
    expect(screen.getByText('Enter a number, like 12.5')).toBeTruthy();
    expect(screen.queryByText('Enter calories')).toBeNull();
    type(/^Calories ·/, '120');
    expect(screen.queryByText('Enter a number, like 12.5')).toBeNull();
    expect(kcal().getAttribute('aria-invalid')).not.toBe('true');
  });

  it('names only ounces in the weight error for US units', async () => {
    const { add } = await setup('us');
    add();
    expect(screen.getByText('Weight from 0.1 to 176.4 oz')).toBeTruthy();
    expect(screen.queryByText(/5000 g/)).toBeNull();
  });

  it('warns when macros disagree by more than 30 %, and still adds', async () => {
    const { onAdd, type, add } = await setup();
    fill(type, '100');
    expect(screen.queryByText(/Macros add up/)).toBeNull(); // kcal alone is no mismatch
    type(/^Protein/, '20');
    type(/^Fat/, '10'); // 20×4 + 10×9 = 170 kcal vs 100
    expect(screen.getByText(/Macros add up to about 170 kcal/)).toBeTruthy();
    add();
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('refuses totals over the API limits: 900 kcal/100 g × 2000 g', async () => {
    const { onAdd, type, add } = await setup();
    type(/^Name/, 'Nuts');
    type(/^Weight/, '2000');
    type(/^Calories ·/, '900');
    add();
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText(/Too much for one dish/)).toBeTruthy();
  });

  it('converts ounces to grams', async () => {
    const { onAdd, type, add } = await setup('us');
    type(/^Name/, 'Yogurt');
    type(/^Weight/, '10');
    type(/^Calories ·/, '100');
    add();
    expect(onAdd.mock.calls[0]![0]).toMatchObject({
      grams: 283.5,
      kcal: 283.5,
    });
  });
});
