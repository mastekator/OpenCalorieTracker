import type { Meta, StoryObj } from '@storybook/react-vite';
import { InstallCard } from './InstallCard';

const meta = {
  title: 'UI/InstallCard',
  component: InstallCard,
  args: { onOpen: () => {}, onHide: () => {} },
} satisfies Meta<typeof InstallCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
export const RussianDark: Story = { globals: { locale: 'ru', theme: 'dark' } };
export const Narrow: Story = {
  globals: { viewport: { value: 'iphoneSE' }, locale: 'ru' },
};
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};
