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

const BAR: Product = {
  ...COOKIES,
  code: '4600000123457',
  name: 'Muesli bar',
  servingG: null,
  packG: null,
  pieces: null,
};

const sheet = async (
  product: Product = COOKIES,
  units: 'metric' | 'us' = 'metric',
) => {
  const onDone = vi.fn();
  const d = defaultAmount(product);
  const grams = d.mode === 'weight' ? d.value : 200;
  renderLoaded(
    <I18nProvider>
      <DishSheet
        original={ORIGINAL}
        grams={grams}
        units={units}
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
    expect(onDone).toHaveBeenCalledWith(
      'Oat cookies',
      150,
      undefined,
      { mode: 'pack', value: 0.75 },
      {},
    );
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
    expect(onDone).toHaveBeenCalledWith(
      'Oat cookies',
      45,
      undefined,
      { mode: 'weight', value: 45 },
      {},
    );
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

describe('AmountPicker: unknown package data (OCT-380 3.1–3.4)', () => {
  const field = (name: string) => screen.getByLabelText<HTMLInputElement>(name);
  const type = (name: string, v: string) =>
    fireEvent.change(field(name), { target: { value: v } });
  const checked = (name: string) => radio(name).getAttribute('aria-checked');
  const WEIGHT = 'Package weight (net)';
  const PIECES = 'How many pieces in the package?';

  it('a typed package weight opens «Package» on «Whole» (AC-4.1)', async () => {
    const onDone = await sheet(BAR);
    const names = screen.getAllByRole('radio').map((r) => r.textContent);
    expect(names).toEqual(['Pieces', 'Grams']);
    screen.getByText('Package weight unknown');
    fireEvent.click(screen.getByRole('button', { name: 'Add package weight' }));
    type(WEIGHT, '40');
    expect(checked('Package')).toBe('true');
    expect(value()).toBe('1pack · 40 g');
    expect(
      screen
        .getByRole('button', { name: 'Whole' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    done();
    expect(onDone).toHaveBeenCalledWith(
      'Oat cookies',
      40,
      undefined,
      { mode: 'pack', value: 1 },
      { packG: 40 },
    );
  });

  // Typed key by key: «600» is valid on the way to «6000».
  const keys = (name: string, v: string) => {
    for (let i = 1; i <= v.length; i++) type(name, v.slice(0, i));
  };

  it('a weight that turns invalid while typed is not kept', async () => {
    const onDone = await sheet(BAR);
    fireEvent.click(screen.getByRole('button', { name: 'Add package weight' }));
    keys(WEIGHT, '6000');
    screen.getByText('Weight 1–5,000 g');
    expect(screen.queryByRole('radio', { name: 'Package' })).toBeNull();
    done();
    expect(onDone).toHaveBeenCalledWith(
      'Oat cookies',
      100,
      undefined,
      { mode: 'weight', value: 100 },
      {},
    );
  });

  it('«Change» typed past 5000 g keeps the product weight', async () => {
    const onDone = await sheet();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    keys(WEIGHT, '6000');
    done();
    expect(onDone).toHaveBeenCalledWith(
      'Oat cookies',
      200,
      undefined,
      { mode: 'pack', value: 1 },
      { packG: 200 },
    );
  });

  it('a piece count that turns invalid while typed is not kept', async () => {
    const onDone = await sheet({ ...COOKIES, pieces: null });
    fireEvent.click(radio('Pieces'));
    keys(PIECES, '1200');
    screen.getByText('A whole number, 1–1,000');
    done();
    expect(onDone.mock.calls[0]![4]).toEqual({});
  });

  it('refuses 0 and 6000 g and keeps the amount (E-7.6)', async () => {
    const onDone = await sheet(BAR);
    fireEvent.click(screen.getByRole('button', { name: 'Add package weight' }));
    for (const v of ['0', '6000']) {
      type(WEIGHT, v);
      screen.getByText('Weight 1–5,000 g');
      expect(screen.queryByRole('radio', { name: 'Package' })).toBeNull();
    }
    done();
    expect(onDone).toHaveBeenCalledWith(
      'Oat cookies',
      100,
      undefined,
      { mode: 'weight', value: 100 },
      {},
    );
  });

  it('ounces go to whole grams before the check', async () => {
    const onDone = await sheet(BAR, 'us');
    fireEvent.click(screen.getByRole('button', { name: 'Add package weight' }));
    type(WEIGHT, '1.4');
    done();
    expect(onDone.mock.calls[0]![4]).toEqual({ packG: 40 });
  });

  it('asks the piece count, refuses 2,5, then counts «of 12» (AC-4.2)', async () => {
    const onDone = await sheet({ ...COOKIES, pieces: null });
    fireEvent.click(radio('Pieces'));
    expect(checked('Pieces')).toBe('true');
    screen.getByText(
      'Package 200 g: we’ll work out the weight of one piece and remember it.',
    );
    type(PIECES, '2,5');
    screen.getByText('A whole number, 1–1,000');
    expect(document.querySelector('.amount__value')).toBeNull();
    type(PIECES, '12');
    expect(value()).toBe('1of 12 · 17 g');
    done();
    expect(onDone).toHaveBeenCalledWith(
      'Oat cookies',
      16.7,
      undefined,
      { mode: 'piece', value: 1 },
      { pieces: 12 },
    );
  });

  it('without a weight asks it above the piece count', async () => {
    const onDone = await sheet(BAR);
    fireEvent.click(radio('Pieces'));
    type(PIECES, '4');
    expect(document.querySelector('.amount__value')).toBeNull();
    type(WEIGHT, '40');
    expect(value()).toBe('1of 4 · 10 g');
    done();
    expect(onDone.mock.calls[0]![4]).toEqual({ pieces: 4, packG: 40 });
  });

  it('«Change» edits a known weight (E-7.2)', async () => {
    await sheet();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(field(WEIGHT).value).toBe('200');
    type(WEIGHT, '300');
    expect(value()).toBe('1pack · 300 g');
  });

  it('«Change» starts from the known weight in ounces', async () => {
    await sheet(COOKIES, 'us');
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(field(WEIGHT).value).toBe('7.1');
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
