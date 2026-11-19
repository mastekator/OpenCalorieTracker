import type { Meta, StoryObj } from '@storybook/react-vite';
import { List } from '../List/List';
import { PILAF, SALAD } from '../../features/kitchen/fixtures';
import { RecipeRow } from './RecipeRow';

const meta = {
  title: 'UI/RecipeRow',
  component: RecipeRow,
  decorators: [(Story) => <List>{Story()}</List>],
  args: { recipe: PILAF, href: '/kitchen/1' },
} satisfies Meta<typeof RecipeRow>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** Photo; kcal per 100 g and per serving. */
export const Photo: Story = {};
export const PhotoDark: Story = { globals: dark };
/** No photo: the illustration on its round tile; no servings: per 100 g only. */
export const Illustration: Story = { args: { recipe: SALAD } };
export const IllustrationDark: Story = {
  args: { recipe: SALAD },
  globals: dark,
};
/** A photo that does not load (offline, not cached) falls back to the illustration. */
export const BrokenPhoto: Story = {
  args: { recipe: { ...PILAF, photoId: 'gone' } },
};
export const LongName: Story = {
  args: {
    recipe: {
      ...SALAD,
      name: 'Chicken with vegetables baked in the oven with rosemary and garlic',
    },
  },
};
