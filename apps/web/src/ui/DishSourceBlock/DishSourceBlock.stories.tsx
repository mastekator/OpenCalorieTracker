import type { Meta, StoryObj } from '@storybook/react-vite';
import { DishSourceBlock } from './DishSourceBlock';

const meta = {
  title: 'UI/DishSourceBlock',
  component: DishSourceBlock,
  args: {
    kind: 'barcode',
    code: '4607012345677',
    original: {
      grams: 140,
      kcal: 92.4,
      proteinG: 11.2,
      fatG: 2.8,
      carbsG: 5.6,
    },
  },
  argTypes: {
    kind: { control: 'inline-radio', options: ['barcode', 'label', 'mine'] },
  },
} satisfies Meta<typeof DishSourceBlock>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** Open Food Facts: the attribution with a link to the product (ODbL). */
export const OpenFoodFacts: Story = {};
export const OpenFoodFactsDark: Story = { globals: dark };
export const Label: Story = { args: { kind: 'label' } };
export const LabelDark: Story = { args: { kind: 'label' }, globals: dark };
const mine = { kind: 'mine', savedAt: '2026-11-02T10:00:00Z' } as const;
export const Mine: Story = { args: mine };
export const MineDark: Story = { args: mine, globals: dark };
/** Not on this device: no date. */
export const MineUndated: Story = { args: { kind: 'mine' } };
export const MineUndatedDark: Story = {
  args: { kind: 'mine' },
  globals: dark,
};
