import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { PendingConflictsView } from './PendingConflicts';

const meta = {
  title: 'Diary/PendingConflicts',
  component: PendingConflictsView,
  args: { count: 3, onChoose: fn() },
} satisfies Meta<typeof PendingConflictsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Several: Story = {};
export const SeveralDark: Story = { globals: { theme: 'dark' } };
export const One: Story = { args: { count: 1 } };
export const OneDark: Story = {
  args: { count: 1 },
  globals: { theme: 'dark' },
};
export const Narrow: Story = { globals: { viewport: { value: 'iphoneSE' } } };
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
