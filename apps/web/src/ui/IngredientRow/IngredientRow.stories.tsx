import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { List } from '../List/List';
import { IngredientRow } from './IngredientRow';

const meta = {
  title: 'UI/IngredientRow',
  component: IngredientRow,
  decorators: [(Story) => <List>{Story()}</List>],
  args: {
    name: 'Long-grain rice',
    kcal: 1440,
    grams: '400',
    onGramsChange: fn(),
    onEdit: fn(),
  },
} satisfies Meta<typeof IngredientRow>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

export const Default: Story = {};
export const DefaultDark: Story = { globals: dark };
/** Salt, spices «to taste»: 0 g is allowed and not counted. */
export const ZeroGrams: Story = {
  args: { name: 'Salt', kcal: 0, grams: '0' },
};
export const Invalid: Story = {
  args: { grams: '-5', error: 'From 0 to 5,000 g' },
};
export const InvalidDark: Story = {
  args: { grams: '-5', error: 'From 0 to 5,000 g' },
  globals: dark,
};
export const LongName: Story = {
  args: { name: 'Pork shoulder, boneless, trimmed of most of the fat' },
};
