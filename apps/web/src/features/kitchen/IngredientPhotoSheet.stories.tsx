import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, waitFor } from 'storybook/test';
import type { RecognizedIngredient } from '@oct/shared';
import { IngredientPhotoSheet } from './IngredientPhotoSheet';

const per100 = (
  kcal: number,
  proteinG: number,
  fatG: number,
  carbsG: number,
) => ({
  kcal,
  proteinG,
  fatG,
  carbsG,
});
const ITEMS: RecognizedIngredient[] = [
  {
    name: 'Wheat flour',
    grams: 512,
    kcal: 1710,
    proteinG: 52.7,
    fatG: 6.1,
    carbsG: 356.9,
    per100: per100(334, 10.3, 1.2, 69.7),
    weight: 'scale',
    source: 'ai',
  },
  {
    name: 'Butter 82.5%',
    grams: 180,
    kcal: 1346,
    proteinG: 1.3,
    fatG: 148.5,
    carbsG: 1.4,
    per100: per100(748, 0.7, 82.5, 0.8),
    weight: 'package',
    source: 'ai',
  },
  {
    name: 'Cottage cheese 5%',
    grams: 400,
    kcal: 484,
    proteinG: 68,
    fatG: 20,
    carbsG: 12,
    per100: per100(121, 17, 5, 3),
    weight: 'barcode',
    source: 'barcode',
    barcode: '4601234567890',
    product: {
      code: '4601234567890',
      name: 'Cottage cheese 5%',
      brand: null,
      kcal100: 121,
      protein100: 17,
      fat100: 5,
      carbs100: 3,
      per: 'g',
      servingG: null,
      servingText: null,
      packG: 400,
    },
  },
  {
    name: 'Chicken eggs',
    grams: 165,
    kcal: 259,
    proteinG: 20.8,
    fatG: 18.2,
    carbsG: 1.2,
    per100: per100(157, 12.6, 11, 0.7),
    weight: 'estimate',
    source: 'ai',
    pieces: 3,
  },
  {
    name: 'Carrots',
    grams: 360,
    kcal: 126,
    proteinG: 4.7,
    fatG: 0.4,
    carbsG: 24.8,
    per100: per100(35, 1.3, 0.1, 6.9),
    weight: 'estimate',
    source: 'ai',
    edible: { grossG: 400, pct: 90, source: 'ref', key: 'carrot' },
  },
];

/** A drawn stand-in for the photo: the browser must be able to decode it. */
async function photo() {
  const canvas = new OffscreenCanvas(400, 300);
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#f3e6cf';
  c.fillRect(0, 0, 400, 300);
  c.fillStyle = '#e8862a';
  c.fillRect(40, 60, 160, 30);
  c.fillStyle = '#f4c542';
  c.fillRect(240, 120, 110, 70);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg' });
  return new File([blob], 'products.jpg', { type: 'image/jpeg' });
}

/** POST /api/photos answers at once; recognition of photo `n` (from 0) answers with `reply(n)`. */
const answer = (reply: (n: number) => Promise<Response>) => () => {
  const real = window.fetch;
  let n = 0;
  window.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/api/photos')) return Response.json({ photoId: 'p1' });
    if (url.includes('mode=ingredients')) return reply(n++);
    return real(input, init);
  };
  return () => {
    window.fetch = real;
  };
};

const meta = {
  title: 'Kitchen/IngredientPhotoSheet',
  component: IngredientPhotoSheet,
  args: {
    file: new File([], 'stand-in.jpg'),
    units: 'metric',
    free: 50,
    onAdd: fn(),
    onRetake: fn(),
    onManual: fn(),
    onClose: fn(),
  },
  loaders: [async () => ({ file: await photo() })],
  render: (args, { loaded }) => (
    <IngredientPhotoSheet {...args} file={loaded.file as File} />
  ),
} satisfies Meta<typeof IngredientPhotoSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

/** 3.1: one honest step while the AI works; the photo isn't kept. */
const waiting: Story = { beforeEach: answer(() => new Promise(() => {})) };
export const Waiting: Story = waiting;
export const WaitingDark: Story = { ...waiting, globals: dark };

/** 3.2: weight source tags, «barcode» with its pack share, carrots gross → edible. */
const review: Story = {
  beforeEach: answer(async () => Response.json({ items: ITEMS })),
};
export const Review: Story = review;
export const ReviewDark: Story = { ...review, globals: dark };
export const ReviewDesktop: Story = { ...review, globals: desktop };
export const ReviewDesktopDark: Story = {
  ...review,
  globals: { ...desktop, ...dark },
};
export const ReviewOunces: Story = { ...review, args: { units: 'us' } };

/** No products on the photo: «Take another» / «Enter manually». */
const empty: Story = {
  beforeEach: answer(async () => Response.json({ items: [] })),
};
export const Empty: Story = empty;
export const EmptyDark: Story = { ...empty, globals: dark };

/** The AI failed: «Try again» uploads the photo again. */
const failed: Story = {
  beforeEach: answer(async () =>
    Response.json({ error: { code: 'ai_failed' } }, { status: 502 }),
  ),
};
export const Failed: Story = failed;
export const FailedDark: Story = { ...failed, globals: dark };

const never = () => new Promise<Response>(() => {});
const items = (list: RecognizedIngredient[]) => async () =>
  Response.json({ items: list });

/** «Another photo» `count` times, each after the sheet shows the review. */
const takeMore =
  (count: number): Story['play'] =>
  async ({ loaded }) => {
    for (let i = 0; i < count; i++) {
      const input = await waitFor(() => {
        const el = document.querySelector<HTMLInputElement>(
          '.photo-ingredients input[type=file]',
        );
        if (!el) throw new Error('no review yet');
        return el;
      });
      await userEvent.upload(input, loaded.file as File);
    }
  };

/** 3.4: photo 2 recognizing in the sheet; the rows of photo 1 stay editable. */
const second: Story = {
  beforeEach: answer((n) => (n ? never() : items(ITEMS)())),
  play: takeMore(1),
};
export const SecondPhoto: Story = second;
export const SecondPhotoDark: Story = { ...second, globals: dark };

/** 3.5: five photos — no camera tile, «5 of 5 photos». */
const five: Story = {
  beforeEach: answer((n) => items([ITEMS[n % ITEMS.length]!])()),
  play: takeMore(4),
};
export const FivePhotos: Story = five;
export const FivePhotosDark: Story = { ...five, globals: dark };
export const FivePhotosDesktop: Story = { ...five, globals: desktop };

/** 4.2: photo 2 failed — a line with «Try again»; photo 1's rows stay. Photo 3 found nothing. */
const secondFailed: Story = {
  beforeEach: answer((n) =>
    n === 0
      ? items(ITEMS.slice(0, 2))()
      : n === 1
        ? Promise.resolve(
            Response.json({ error: { code: 'ai_failed' } }, { status: 502 }),
          )
        : items([])(),
  ),
  play: takeMore(2),
};
export const SecondFailed: Story = secondFailed;
export const SecondFailedDark: Story = { ...secondFailed, globals: dark };

/** 4.3: the recipe has 47 — the last two rows «won't fit», «Add the first 3». */
const limit: Story = { ...review, args: { free: 3 } };
export const Limit: Story = limit;
export const LimitDark: Story = { ...limit, globals: dark };
