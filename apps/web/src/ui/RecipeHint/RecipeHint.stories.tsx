import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PILAF } from '../../features/kitchen/fixtures';
import { RecipeHint } from './RecipeHint';

const meta = {
  title: 'UI/RecipeHint',
  component: RecipeHint,
  args: { recipe: PILAF, onApply: fn(), onKeep: fn() },
} satisfies Meta<typeof RecipeHint>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
export const Desktop: Story = {
  globals: { viewport: { value: 'desktop' } },
};
