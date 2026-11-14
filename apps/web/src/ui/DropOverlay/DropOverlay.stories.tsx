import type { Meta, StoryObj } from '@storybook/react-vite';
import { DropOverlay } from './DropOverlay';

/** What the window shows while a file is dragged over it (desktop, E.1). */
const meta = {
  title: 'UI/DropOverlay',
  component: DropOverlay,
  args: { open: true },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DropOverlay>;
export default meta;
type Story = StoryObj<typeof meta>;

const desktop = { viewport: { value: 'desktop' } };

export const Desktop: Story = { globals: desktop };
export const DesktopDark: Story = { globals: { ...desktop, theme: 'dark' } };
export const Russian: Story = { globals: { ...desktop, locale: 'ru' } };
