import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { BarcodeConsentSheet } from './BarcodeConsentSheet';

/** OCT-313 4.4: the short consent sheet, opened from the edit screen (2.5). */
const meta = {
  title: 'Settings/BarcodeConsentSheet',
  component: BarcodeConsentSheet,
  args: { open: true, onEnable: fn(), onClose: fn() },
} satisfies Meta<typeof BarcodeConsentSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
export const Desktop: Story = {
  globals: { viewport: { value: 'desktop' } },
};
export const DesktopDark: Story = {
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
