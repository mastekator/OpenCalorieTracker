import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { defaultAmount, type Product } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { DishRow } from '../DishRow/DishRow';
import { DishSheet } from '../DishSheet/DishSheet';

const COOKIES: Product = {
  code: '4607012345678',
  name: 'Oat cookies',
  brand: null,
  kcal100: 440,
  protein100: 6,
  fat100: 16,
  carbs100: 68,
  per: 'g',
  servingG: 30,
  servingText: null,
  packG: 200,
  pieces: 12,
};
const ORIGINAL = {
  name: 'Oat cookies',
  grams: 200,
  kcal: 880,
  proteinG: 12,
  fatG: 32,
  carbsG: 136,
};

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

const sheet = async (product: Product = COOKIES) => {
  const onDone = vi.fn();
  renderLoaded(
    <I18nProvider>
      <DishSheet
        original={ORIGINAL}
        grams={200}
        units="metric"
        product={product}
        amount={defaultAmount(product)}
        onDone={onDone}
        onDelete={() => {}}
        onClose={() => {}}
      />
    </I18nProvider>,
  );
  await screen.findByRole('radiogroup', { name: 'Count by' });
  return onDone;
};
const value = () =>
  document
    .querySelector('.amount__value')!
    .textContent!.replace(/\u00a0/g, ' ');
const radio = (name: string) => screen.getByRole('radio', { name });
const done = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));

describe('AmountPicker in the dish sheet', () => {
  it('offers the modes the product allows', async () => {
    await sheet();
    const names = screen
      .getAllByRole('radio')
      .map((r) => r.textContent)
      .join(' · ');
    expect(names).toBe('Package · Servings · Pieces · Grams');
    expect(value()).toBe('1pack · 200 g');
  });

  it('a share of the package gives its grams', async () => {
    const onDone = await sheet();
    fireEvent.click(screen.getByRole('button', { name: '½' }));
    expect(value()).toBe('½pack · 100 g');
    fireEvent.click(screen.getByRole('button', { name: 'More by ¼ package' }));
    expect(value()).toBe('¾pack · 150 g');
    done();
    expect(onDone).toHaveBeenCalledWith('Oat cookies', 150, undefined, {
      mode: 'pack',
      value: 0.75,
    });
  });

  it('counts pieces «of 12» and servings, no quick picks there', async () => {
    await sheet();
    fireEvent.click(radio('Pieces'));
    expect(value()).toBe('12of 12 · 200 g');
    fireEvent.click(screen.getByRole('button', { name: 'More by 1 piece' }));
    expect(value()).toBe('13pcs · 217 g');
    expect(screen.queryByRole('group', { name: 'Quick pick' })).toBeNull();
    fireEvent.click(radio('Servings'));
    expect(value()).toBe('7servings · 210 g');
  });

  it('stops at one step', async () => {
    await sheet();
    fireEvent.click(screen.getByRole('button', { name: '¼' }));
    const less = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Less by ¼ package',
    });
    expect(less.disabled).toBe(true);
  });

  it('typed grams are the «Grams» mode (AC-3.6)', async () => {
    const onDone = await sheet();
    fireEvent.click(radio('Grams'));
    const field = screen.getByRole('textbox', { name: /Oat cookies/ });
    expect((field as HTMLInputElement).value).toBe('200');
    fireEvent.change(field, { target: { value: '45' } });
    done();
    expect(onDone).toHaveBeenCalledWith('Oat cookies', 45, undefined, {
      mode: 'weight',
      value: 45,
    });
  });

  it('ml for a drink, «same as last time» for the remembered pick', async () => {
    await sheet({
      ...COOKIES,
      per: 'ml',
      pieces: null,
      last: { mode: 'pack', value: 0.5 },
    });
    expect(value()).toBe('½pack · 100 ml');
    expect(screen.getByText('same as last time')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Whole' }));
    expect(screen.queryByText('same as last time')).toBeNull();
  });
});

describe('DishRow share', () => {
  const row = async (amount: Parameters<typeof defaultAmount>[0]['last']) => {
    const onChange = vi.fn();
    renderLoaded(
      <I18nProvider>
        <DishRow
          dish={{ ...ORIGINAL, source: 'barcode' }}
          units="metric"
          onGramsChange={() => {}}
          onEdit={() => {}}
          share={{ product: COOKIES, amount: amount!, onChange }}
        />
      </I18nProvider>,
    );
    await screen.findByRole('button', { name: /More by/ });
    return onChange;
  };
  const label = () => document.querySelector('.dish-row__share')!.textContent;

  it('shows the share and its grams', async () => {
    await row({ mode: 'pack', value: 1 });
    expect(label()).toBe('1 pack · 200 g');
  });

  it('«2 of 12 · 33 g», ± by a piece', async () => {
    const onChange = await row({ mode: 'piece', value: 2 });
    expect(label()).toBe('2 of 12 · 33 g');
    fireEvent.click(screen.getByRole('button', { name: 'More by 1 piece' }));
    expect(onChange).toHaveBeenCalledWith({ mode: 'piece', value: 3 });
  });
});
