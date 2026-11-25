import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mockModel } from '../../test/ai.js';
import { readExpected } from './compare.js';
import { pendingPhotos, testPhotos } from './runner.js';

vi.mock('./compare.js', async (orig) => ({
  ...(await orig<typeof import('./compare.js')>()),
  readExpected: vi.fn(),
}));

const carrot = {
  name: 'Carrot',
  readValue: 500,
  readUnit: 'g',
  weightFrom: 'scale',
  estimateG: 400,
  pieces: null,
  unit: null,
  kcal100: 41,
  protein100: 0.9,
  fat100: 0.2,
  carbs100: 9.6,
  confidence: 0.9,
  barcode: null,
  printedBarcode: null,
  edibleRef: null,
  ediblePct: null,
};
const banana = {
  name: 'Banana',
  grams: 120,
  kcal: 105,
  proteinG: 1.3,
  fatG: 0.4,
  carbsG: 27,
  confidence: 0.9,
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.mocked(readExpected).mockResolvedValue({
    set: 4,
    photos: [
      {
        file: 'banana.jpg',
        mode: 'ingredients',
        level: 'exact',
        items: [{ words: ['carrot'], grams: 450 }],
      },
      {
        file: 'eggs.jpg',
        level: 'exact',
        ref: 105,
        dishes: [{ words: ['banana'], count: 1 }],
      },
    ],
  });
});
afterEach(() => vi.restoreAllMocks());

it('scores a raw-products photo by grams and an old case as before', async () => {
  const { photos } = await pendingPhotos();
  expect(photos[0]!.expected).toBe('carrot 360-540 g; exact');
  await testPhotos(
    mockModel({ items: [carrot] }, { dishes: [banana] }),
    photos,
  );
  expect(photos[0]).toMatchObject({
    got: 'Carrot 500 g',
    kcal: 205,
    misses: [],
    result: 'ok',
  });
  expect(photos[1]).toMatchObject({ got: 'Banana', questions: 0 });
});

it('names the grams and barcode misses of a raw product', async () => {
  vi.mocked(readExpected).mockResolvedValue({
    set: 4,
    photos: [
      {
        file: 'banana.jpg',
        mode: 'ingredients',
        level: 'exact',
        items: [{ words: ['carrot'], grams: 1000, barcode: '4006381333931' }],
      },
    ],
  });
  const { photos } = await pendingPhotos();
  await testPhotos(mockModel({ items: [carrot] }), photos);
  expect(photos[0]!.misses).toEqual([
    { code: 'grams', dish: 'carrot', got: 500 },
    { code: 'barcode', dish: 'carrot' },
  ]);
});
