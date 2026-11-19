import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, fn, within } from 'storybook/test';
import type { HistoryDish } from '../../data/DataContext';
import { IngredientPickerSheet } from './IngredientPickerSheet';

const HISTORY: HistoryDish[] = [
  {
    name: 'Korean carrot salad',
    grams: 150,
    kcal: 195,
    proteinG: 2,
    fatG: 15,
    carbsG: 12,
    eatenAt: '2026-11-03T12:00:00.000Z',
  },
  {
    name: 'Carrots, raw',
    grams: 100,
    kcal: 35,
    proteinG: 1,
    fatG: 0,
    carbsG: 7,
    eatenAt: '2026-10-28T12:00:00.000Z',
  },
];

const meta = {
  title: 'UI/IngredientPickerSheet',
  component: IngredientPickerSheet,
  args: {
    search: async (q: string) =>
      HISTORY.filter((d) => d.name.toLowerCase().includes(q.toLowerCase())),
    onPick: fn(),
    onManual: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof IngredientPickerSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

const type =
  (value: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    fireEvent.change(
      await within(canvasElement.ownerDocument.body).findByRole('searchbox'),
      { target: { value } },
    );
  };

const dark = { theme: 'dark' };

/** Nothing typed: only «Enter manually». */
export const Empty: Story = {};
export const EmptyDark: Story = { globals: dark };
/** «car»: dishes from the diary, then «Enter “car” manually». */
export const Found: Story = { play: type('car') };
export const FoundDark: Story = { play: type('car'), globals: dark };
export const NothingFound: Story = { play: type('quinoa') };
export const Desktop: Story = {
  play: type('car'),
  globals: { viewport: { value: 'desktop' } },
};
