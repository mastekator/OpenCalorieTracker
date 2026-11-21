import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { MealInput, Product } from '@oct/shared';
import type { BarcodeResult } from '../../data/products';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { ToastProvider } from '../../ui/Toast/Toast';
import { MealEditScreen } from './MealEditScreen';
import type { Recognized } from './refine';

// OCT-382/384: the decoder read D, the AI read I under the bars (ADR-0036 §5).
const D = '4991433601383';
const I = '8997035601383';
const pocari: Product = {
  code: I,
  name: 'Pocari Ion Water 500ml',
  brand: null,
  kcal100: 11,
  protein100: 0,
  fat100: 0,
  carbs100: 2.7,
  per: 'ml',
  servingG: 500,
  servingText: null,
};
const tea: Recognized = {
  name: 'Iced lemon tea',
  grams: 500,
  kcal: 150,
  proteinG: 0,
  fatG: 0,
  carbsG: 37.5,
  source: 'barcode',
  barcode: D,
  from: 'off',
  alt: { code: I, product: pocari, from: 'off' },
};
const label: Recognized = {
  name: 'Ion drink',
  grams: 500,
  kcal: 55,
  proteinG: 0,
  fatG: 0,
  carbsG: 13.5,
  source: 'label',
  barcode: D,
  alt: { code: I, product: null },
};

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, '');
});

const render = (
  dish: Recognized,
  onBarcode?: (code: string) => Promise<BarcodeResult>,
) => {
  const onSave = vi.fn<(input: MealInput) => Promise<void>>(async () => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json([])),
  );
  const view = renderLoaded(
    <I18nProvider>
      <ToastProvider>
        <MealEditScreen
          dishes={[dish]}
          photoId="p1"
          units="metric"
          recognition="ready"
          onSave={onSave}
          onClose={() => {}}
          onBarcode={onBarcode}
        />
      </ToastProvider>
    </I18nProvider>,
  );
  return { onSave, view };
};

const row = () =>
  screen.getByRole('textbox', { name: /^Weight of / }).closest('li')!;
const openSheet = async (dish: string) =>
  fireEvent.click(await screen.findByRole('button', { name: `Edit ${dish}` }));
const saved = async (onSave: ReturnType<typeof render>['onSave']) => {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[0]![0].items[0]!;
};

describe('Another barcode in the «Dish» sheet (OCT-383)', () => {
  it('«Replace» with a product makes the dish that product, code I; the hint and «check» go (AC-3, AC-5)', async () => {
    const { onSave } = render(tea);
    await screen.findByRole('button', { name: 'Edit Iced lemon tea' });
    expect(row().textContent).toContain('check');
    await openSheet('Iced lemon tea');

    fireEvent.click(
      screen.getByRole('button', {
        name: `Replace with Pocari Ion Water 500ml, barcode ${I}`,
      }),
    );
    // The sheet shows product I at once (2.2).
    expect(
      (screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value,
    ).toBe('Pocari Ion Water 500ml');
    screen.getByText(I);
    screen.getByText('Found in Open Food Facts — check the weight.');
    expect(screen.queryByRole('button', { name: /^Replace/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(row().textContent).toContain('Pocari Ion Water 500ml');
    expect(row().textContent).toContain('55');
    expect(row().textContent).not.toContain('check');
    const item = await saved(onSave);
    expect(item).toMatchObject({
      name: 'Pocari Ion Water 500ml',
      grams: 500,
      kcal: 55,
      carbsG: 13.5,
      source: 'barcode',
      barcode: I,
    });
  });

  it('«Close» after «Replace» drops it: the row stays as it was', async () => {
    const { onSave } = render(tea);
    await openSheet('Iced lemon tea');
    fireEvent.click(screen.getByRole('button', { name: /^Replace with/ }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }),
    );
    expect(row().textContent).toContain('Iced lemon tea');
    expect(row().textContent).toContain('check');
    expect(await saved(onSave)).toMatchObject({ barcode: D, kcal: 150 });
  });

  it('«Replace» without a product: only the code changes, one search, the label numbers stay (AC-4)', async () => {
    let answer!: (r: BarcodeResult) => void;
    const onBarcode = vi.fn(
      () => new Promise<BarcodeResult>((resolve) => (answer = resolve)),
    );
    const { onSave } = render(label, onBarcode);
    await openSheet('Ion drink');
    screen.getByText(`Looks like the package says ${I}`);

    const replace = screen.getByRole('button', {
      name: `Replace the barcode with ${I}`,
    });
    fireEvent.click(replace);
    fireEvent.click(replace);
    screen.getByText(`Searching ${I}…`);
    screen.getByText(I);
    // No second search while the first one is on its way.
    expect(screen.queryByRole('button', { name: /^Replace/ })).toBeNull();
    expect(onBarcode).toHaveBeenCalledTimes(1);
    expect(onBarcode).toHaveBeenCalledWith(I);

    answer({ product: null, from: null, off: 'missing' });
    await screen.findByText(
      'No product with this code in your products or Open Food Facts. We replaced the code and kept the label numbers.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(row().textContent).toContain('Ion drink');
    expect(row().textContent).not.toContain('check');
    expect(await saved(onSave)).toMatchObject({
      name: 'Ion drink',
      kcal: 55,
      source: 'label',
      barcode: I,
    });
  });

  it('«Replace» without a product, found by the search: the sheet takes the product (AC-4)', async () => {
    const onBarcode = vi.fn(async (): Promise<BarcodeResult> => ({
      product: pocari,
      from: 'off',
      off: 'found',
    }));
    const { onSave } = render(label, onBarcode);
    await openSheet('Ion drink');
    fireEvent.click(screen.getByRole('button', { name: /^Replace the/ }));
    await screen.findByText('Found in Open Food Facts — check the weight.');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await saved(onSave)).toMatchObject({
      name: 'Pocari Ion Water 500ml',
      kcal: 55,
      source: 'barcode',
      barcode: I,
    });
  });

  it('an AI dish shows its code in a short «Barcode» block; offline keeps the estimate (3.4)', async () => {
    const onBarcode = vi.fn(async (): Promise<BarcodeResult> => ({
      product: null,
      from: null,
      off: 'offline',
    }));
    render(
      { ...label, source: 'ai', confidence: 0.6, name: 'Drink' },
      onBarcode,
    );
    await openSheet('Drink');
    screen.getByText('Barcode');
    screen.getByText(D);
    fireEvent.click(screen.getByRole('button', { name: /^Replace the/ }));
    await screen.findByText(
      'Offline we only search this phone, and it isn’t here. We replaced the code and kept the numbers.',
    );
  });
});
