import type { Meta, StoryObj } from '@storybook/react-vite';
import { LocaleToggle } from './LocaleToggle';

/** Shows the language it switches to; the locale toolbar sets the current one. */
const meta = {
  title: 'UI/LocaleToggle',
  component: LocaleToggle,
} satisfies Meta<typeof LocaleToggle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const English: Story = { globals: { locale: 'en' } };
export const Russian: Story = { globals: { locale: 'ru' } };
export const Dark: Story = { globals: { theme: 'dark' } };
