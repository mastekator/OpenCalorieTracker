import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { HistoryHint } from './HistoryHint';

const meta = {
  title: 'UI/HistoryHint',
  component: HistoryHint,
  args: {
    eatenAt: '2026-11-12T12:30:00.000Z',
    grams: 250,
    kcal: 420,
    units: 'metric',
    onApply: fn(),
    onKeep: fn(),
  },
  argTypes: { units: { control: 'inline-radio', options: ['metric', 'us'] } },
} satisfies Meta<typeof HistoryHint>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Grams: Story = {};
export const Ounces: Story = { args: { units: 'us' } };
export const Dark: Story = { globals: { theme: 'dark' } };
export const DarkOunces: Story = {
  args: { units: 'us' },
  globals: { theme: 'dark' },
};
