import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { OffSuggestCard } from './OffSuggestCard';

const meta = {
  title: 'UI/OffSuggestCard',
  component: OffSuggestCard,
  args: { onEnable: fn(), onLater: fn() },
} satisfies Meta<typeof OffSuggestCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
