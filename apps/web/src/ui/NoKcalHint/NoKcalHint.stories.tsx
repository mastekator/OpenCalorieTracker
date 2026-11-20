import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { NoKcalHint } from './NoKcalHint';

const meta = {
  title: 'UI/NoKcalHint',
  component: NoKcalHint,
  args: { onShoot: fn() },
} satisfies Meta<typeof NoKcalHint>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
export const Busy: Story = { args: { busy: true } };
