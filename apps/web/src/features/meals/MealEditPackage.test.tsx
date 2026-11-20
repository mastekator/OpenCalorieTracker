import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { PhotoBarcodesResponse, Product } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { ToastProvider } from '../../ui/Toast/Toast';
import { MealEditScreen } from './MealEditScreen';
import type { Recognized } from './refine';

// jsdom has no canvas: the label photo goes as is.
vi.mock('./prepareImage', async (original) => ({
  ...(await original<typeof import('./prepareImage')>()),
  prepareImage: async (file: Blob) => file,
}));

const CODE = '4006381333931';
const product: Product = {
  code: CODE,
  name: 'Greek yogurt 2%',
  brand: null,
  kcal100: null,
  protein100: null,
  fat100: null,
  carbs100: null,
  per: 'g',
  servingG: null,
  servingText: null,
};
const estimate: Recognized = {
  name: 'Greek yogurt 2%',
  grams: 150,
  kcal: 120,
  proteinG: 5,
  fatG: 4,
  carbsG: 15,
  confidence: 0.7,
  source: 'ai',
  barcode: CODE,
  check: true,
};
const codes = (
  result: PhotoBarcodesResponse['codes'][number]['result'],
): PhotoBarcodesResponse['codes'] => [{ code: CODE, result }];

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, '');
});

const render = (props: Partial<Parameters<typeof MealEditScreen>[0]>) =>
  renderLoaded(
    <I18nProvider>
      <ToastProvider>
        <MealEditScreen
          dishes={[estimate]}
          photoId="p1"
          units="metric"
          onSave={async () => {}}
          onClose={() => {}}
          {...props}
        />
      </ToastProvider>
    </I18nProvider>,
  );

const kcalOfRow = () =>
  screen.getByRole('textbox', { name: /^Weight of / }).closest('li')!
    .textContent;

describe('«Photograph the label» (OCT-313 2.4)', () => {
  it('reads the new photo as this package label, replaces the dish, «Undo» brings it back', async () => {
    const fetch = vi.fn(async (path: string) =>
      path === '/api/photos'
        ? Response.json({ photoId: 'l1' })
        : path.startsWith('/api/photos/l1/recognize')
          ? Response.json({
              dishes: [{ ...estimate, grams: 140, kcal: 98, confidence: 0.9 }],
              questions: [],
            })
          : Response.json([]),
    );
    vi.stubGlobal('fetch', fetch);
    await render({ codes: codes({ product, from: 'off', off: 'found' }) });
    expect(kcalOfRow()).toContain('120');

    fireEvent.click(
      screen.getByRole('button', { name: 'Photograph the label' }),
    );
    // The edits survive the camera unloading the page.
    expect((history.state as { draft?: unknown[] }).draft).toHaveLength(1);
    fireEvent.change(screen.getByTestId('edit-label'), {
      target: { files: [new File(['x'], 'label.jpg')] },
    });

    await screen.findByText('Updated from the label');
    expect(fetch).toHaveBeenCalledWith(
      `/api/photos/l1/recognize?mode=label&barcode=${CODE}`,
      expect.anything(),
    );
    expect(kcalOfRow()).toContain('98');
    expect(
      screen.queryByRole('button', { name: 'Photograph the label' }),
    ).toBeNull();
    expect(history.state).toEqual({});

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(kcalOfRow()).toContain('120');
  });

  it('nothing read: the dish stays, a toast says why', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) =>
        path === '/api/photos'
          ? Response.json({ photoId: 'l1' })
          : Response.json(
              path.includes('recognize') ? { dishes: [], questions: [] } : [],
            ),
      ),
    );
    await render({ codes: codes({ product, from: 'off', off: 'found' }) });
    fireEvent.click(
      screen.getByRole('button', { name: 'Photograph the label' }),
    );
    fireEvent.change(screen.getByTestId('edit-label'), {
      target: { files: [new File(['x'], 'label.jpg')] },
    });
    await screen.findByText(/Couldn’t read the label/);
    expect(kcalOfRow()).toContain('120');
  });
});

describe('«Turn on Open Food Facts» (OCT-313 2.5)', () => {
  const plain: Recognized = { ...estimate, check: undefined, name: 'Yogurt' };
  const found = codes({
    product: { ...product, kcal100: 70, servingG: 140 },
    from: 'off',
    off: 'found',
  });

  it('«Turn on» → consent → lookup → the dish updated, «Undo» brings it back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([])),
    );
    const onOffHint = vi.fn(async () => found);
    await render({
      dishes: [plain],
      codes: codes({ product: null, from: null, off: 'disabled' }),
      offSuggest: true,
      onOffHint,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(
      [...sheet.querySelectorAll('button')].find(
        (b) => b.textContent === 'Turn on',
      )!,
    );
    await screen.findByText('Found in Open Food Facts');
    expect(onOffHint).toHaveBeenCalledWith(true);
    expect(kcalOfRow()).toContain('98');
    expect(screen.queryByText(/There’s a barcode in the photo/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(kcalOfRow()).toContain('120');
  });

  it('«Not now» hides the card and writes the date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([])),
    );
    const onOffHint = vi.fn(async () => []);
    await render({ dishes: [plain], offSuggest: true, onOffHint });
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onOffHint).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(screen.queryByText(/There’s a barcode in the photo/)).toBeNull(),
    );
  });
});
