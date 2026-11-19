import type { Meta, StoryObj } from '@storybook/react-vite';
import { PILAF, SALAD } from '../../features/kitchen/fixtures';
import { RecipeThumb } from './RecipeThumb';

const meta = {
  title: 'UI/RecipeThumb',
  component: RecipeThumb,
  args: { recipe: PILAF },
} satisfies Meta<typeof RecipeThumb>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** The recipe photo: a rounded square. */
export const Photo: Story = {};
export const PhotoDark: Story = { globals: dark };
/** No photo: the illustration on its round tile. */
export const Illustration: Story = { args: { recipe: SALAD } };
export const IllustrationDark: Story = {
  args: { recipe: SALAD },
  globals: dark,
};
/** A photo that does not load falls back to the illustration. */
export const BrokenPhoto: Story = {
  args: { recipe: { ...PILAF, photoId: 'gone' } },
};
