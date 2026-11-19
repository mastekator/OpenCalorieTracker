import type { Meta, StoryObj } from '@storybook/react-vite';
import { PILAF, SALAD } from '../../features/kitchen/fixtures';
import { NutritionCard } from './NutritionCard';

const meta = {
  title: 'UI/NutritionCard',
  component: NutritionCard,
  args: PILAF,
} satisfies Meta<typeof NutritionCard>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** Serving by default: 581 kcal · serving 350 g. */
export const Serving: Story = {};
export const ServingDark: Story = { globals: dark };
export const ServingRussian: Story = { globals: { locale: 'ru' } };
/** Whole: 3 487 kcal for 2 100 g. */
export const Whole: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('radio', { name: 'Whole' }));
  },
};
export const WholeDark: Story = { ...Whole, globals: dark };
/** No servings: 100 g by default, the segment has no Serving. */
export const NoServings: Story = { args: SALAD };
export const NoServingsDark: Story = { args: SALAD, globals: dark };
