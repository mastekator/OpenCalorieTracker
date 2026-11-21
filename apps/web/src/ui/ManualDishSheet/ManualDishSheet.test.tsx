import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { Product, Units } from '@oct/shared';
import type { BarcodeResult } from '../../data/products';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { BASIS_KEY, ManualDishSheet } from './ManualDishSheet';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
});
afterEach(cleanup);

async function setup(
  units: Units = 'metric',
  lookup?: (code: string) => Promise<BarcodeResult>,
) {
  const onAdd = vi.fn();
  await renderLoaded(
    <I18nProvider>
      <ManualDishSheet
        units={units}
        onAdd={onAdd}
        onClose={() => {}}
        lookup={lookup}
      />
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
    expect(screen.getByText('Enter the weight')).toBeTruthy();
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
    const { type, add } = await setup('us');
    type(/^Weight/, '500');
    add();
    expect(screen.getByText('Weight from 0.1 to 176.4 oz')).toBeTruthy();
    expect(screen.queryByText(/5000 g/)).toBeNull();
  });

  it('grams by default: no unit on the dish (ADR-0038 §3)', async () => {
    const { onAdd, type, add } = await setup();
    expect(
      screen.getByRole('radio', { name: 'Grams' }).getAttribute('aria-checked'),
    ).toBe('true');
    fill(type);
    add();
    expect(onAdd.mock.calls[0]![0]).not.toHaveProperty('unit');
  });

  it('«ml»: volume per 100 ml, the dish comes with unit ml (AC-1)', async () => {
    const { onAdd, type, add } = await setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Milliliters' }));
    add();
    expect(screen.getByText('Enter the volume')).toBeTruthy();
    type(/^Name/, 'Kefir');
    type(/^Volume/, '6000');
    expect(screen.getByText('Volume 1–5,000 ml')).toBeTruthy();
    type(/^Volume/, '250');
    type(/^Calories ·/, '40');
    expect(screen.getByRole('radio', { name: 'Per 100 ml' })).toBeTruthy();
    expect(screen.getByText('Total for 250 ml: 100 kcal')).toBeTruthy();
    add();
    expect(onAdd.mock.calls[0]![0]).toMatchObject({
      name: 'Kefir',
      grams: 250,
      unit: 'ml',
      kcal: 100,
    });
  });

  it('US «ml»: fluid ounces to millilitres, fl oz in the error', async () => {
    const { onAdd, type, add } = await setup('us');
    fireEvent.click(screen.getByRole('radio', { name: 'Milliliters' }));
    type(/^Name/, 'Juice');
    type(/^Volume/, '200');
    type(/^Calories ·/, '45');
    add();
    expect(screen.getByText('Volume 0.1–169 fl oz')).toBeTruthy();
    type(/^Volume/, '10');
    add();
    expect(onAdd.mock.calls[0]![0]).toMatchObject({
      grams: 295.7,
      unit: 'ml',
    });
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

const YOGURT: Product = {
  code: '4006381333931',
  name: 'Greek yogurt',
  brand: null,
  kcal100: 66,
  protein100: 8,
  fat100: 2,
  carbs100: 4,
  per: 'g',
  servingG: 140,
  servingText: null,
};

describe('ManualDishSheet: barcode (OCT-313 §3)', () => {
  const find = (code: string) => {
    const field = screen.getByLabelText('Barcode');
    fireEvent.change(field, { target: { value: code } });
    fireEvent.keyDown(field, { key: 'Enter' });
  };

  it('Enter finds the product: fills the empty fields per 100 g, the weight is the serving, the barcode is added', async () => {
    const lookup = vi.fn(async () => ({
      product: YOGURT,
      from: 'off' as const,
      off: 'found' as const,
    }));
    const { onAdd, type, add } = await setup('metric', lookup);
    fireEvent.click(screen.getByRole('radio', { name: 'Per serving' }));
    type(/^Name/, 'My yogurt');
    find('4006381-333931');
    await screen.findByText('Found in Open Food Facts — check the weight.');
    expect(lookup).toHaveBeenCalledWith('4006381333931');
    add();
    expect(onAdd).toHaveBeenCalledWith({
      barcode: '4006381333931',
      name: 'My yogurt', // typed before the lookup: kept
      grams: 140,
      kcal: 92.4,
      proteinG: 11.2,
      fatG: 2.8,
      carbsG: 5.6,
    });
  });

  it('a name typed while the lookup runs is kept', async () => {
    let answer!: (r: BarcodeResult) => void;
    const lookup = () => new Promise<BarcodeResult>((r) => (answer = r));
    const { onAdd, type, add } = await setup('metric', lookup);
    find('4006381333931');
    type(/^Name/, 'My yogurt');
    answer({ product: YOGURT, from: 'off', off: 'found' });
    await screen.findByText('Found in Open Food Facts — check the weight.');
    add();
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ name: 'My yogurt' });
  });

  it('typed calories keep their basis: only the name and weight are filled', async () => {
    const lookup = async () =>
      ({ product: YOGURT, from: 'mine', off: 'skipped' }) as const;
    const { onAdd, type, add } = await setup('metric', lookup);
    type(/^Calories ·/, '50');
    find('4006381333931');
    await screen.findByText('Found your product — check the weight.');
    add();
    expect(onAdd.mock.calls[0]![0]).toMatchObject({
      name: 'Greek yogurt',
      grams: 140,
      kcal: 70,
      proteinG: 0,
    });
  });

  it('a known package weight fills the whole package (AC-3.8)', async () => {
    const lookup = async () =>
      ({
        product: { ...YOGURT, packG: 400 },
        from: 'off',
        off: 'found',
      }) as const;
    const { onAdd, add } = await setup('metric', lookup);
    find('4006381333931');
    await screen.findByText('Found in Open Food Facts — check the weight.');
    add();
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ grams: 400, kcal: 264 });
  });

  it('a product per ml sets the unit: no switch, «Unit from the package» (AC-3)', async () => {
    const lookup = async () =>
      ({
        product: { ...YOGURT, name: 'Orange juice', per: 'ml', servingG: 250 },
        from: 'off',
        off: 'found',
      }) as const;
    const { onAdd, add } = await setup('metric', lookup);
    find('4006381333931');
    await screen.findByText('Found in Open Food Facts — check the volume.');
    expect(screen.queryByRole('radio', { name: 'Grams' })).toBeNull();
    expect(screen.getByText('Unit from the package')).toBeTruthy();
    expect(screen.getByLabelText(/^Volume/)).toBeTruthy();
    add();
    expect(onAdd.mock.calls[0]![0]).toMatchObject({
      name: 'Orange juice',
      grams: 250,
      unit: 'ml',
    });
    // Another code: the unit is the user's again.
    fireEvent.change(screen.getByLabelText('Barcode'), {
      target: { value: '5000112637922' },
    });
    expect(screen.getByRole('radio', { name: 'Grams' })).toBeTruthy();
  });

  it('a product per g hides the switch too', async () => {
    const lookup = async () =>
      ({ product: YOGURT, from: 'local', off: 'skipped' }) as const;
    await setup('metric', lookup);
    fireEvent.click(screen.getByRole('radio', { name: 'Milliliters' }));
    find('4006381333931');
    await screen.findByText('Found on this phone — check the weight.');
    expect(screen.queryByRole('radiogroup', { name: 'Unit' })).toBeNull();
    expect(screen.getByLabelText(/^Weight/)).toBeTruthy();
  });

  it('not found: says so and moves focus to the name', async () => {
    const lookup = async () =>
      ({ product: null, from: null, off: 'disabled' }) as const;
    await setup('metric', lookup);
    find('4006381333931');
    await screen.findByText(
      'Not in your products. Open Food Facts lookup is off — you can turn it on in Integrations.',
    );
    expect(document.activeElement).toBe(screen.getByLabelText(/^Name/));
  });

  it('a wrong code is an error on «Find» and on «Add»', async () => {
    const lookup = vi.fn();
    const { onAdd, add } = await setup('metric', lookup);
    find('12345');
    expect(screen.getByText('A barcode has 8 to 14 digits')).toBeTruthy();
    expect(lookup).not.toHaveBeenCalled();
    find('4006381333932');
    add();
    expect(onAdd).not.toHaveBeenCalled();
    expect(
      screen.getByText('This barcode is not valid — check the digits'),
    ).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Barcode'));
  });

  it('offline and Open Food Facts down have their own texts', async () => {
    let off: BarcodeResult['off'] = 'offline';
    await setup('metric', async () => ({ product: null, from: null, off }));
    find('4006381333931');
    await screen.findByText(/^Offline we only search products/);
    off = 'down';
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    await screen.findByText(/^Open Food Facts didn’t respond/);
  });

  it('opens with the photo’s barcode and says it was not found (3.4)', async () => {
    await renderLoaded(
      <I18nProvider>
        <ManualDishSheet
          units="metric"
          onAdd={() => {}}
          onClose={() => {}}
          lookup={vi.fn()}
          barcode="4006381333931"
          photoNotFound="admin"
        />
      </I18nProvider>,
    );
    expect((screen.getByLabelText('Barcode') as HTMLInputElement).value).toBe(
      '4006381333931',
    );
    expect(
      screen.getByText(/We couldn’t find the barcode from the photo/)
        .textContent,
    ).toContain('Turn on AI to read labels.');
  });

  it('no lookup: no barcode field', async () => {
    await setup();
    expect(screen.queryByLabelText('Barcode')).toBeNull();
  });
});
