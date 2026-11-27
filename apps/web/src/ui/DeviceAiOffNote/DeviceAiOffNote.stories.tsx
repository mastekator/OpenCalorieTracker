import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeviceAiOffNote } from './DeviceAiOffNote';

const meta = {
  title: 'UI/DeviceAiOffNote',
  component: DeviceAiOffNote,
  args: { href: '/settings/ai' },
} satisfies Meta<typeof DeviceAiOffNote>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
export const RussianDark: Story = {
  globals: { locale: 'ru', theme: 'dark' },
};
