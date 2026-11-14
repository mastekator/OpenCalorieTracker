import type { Meta, StoryObj } from '@storybook/react-vite';
import { DropZone } from './DropZone';

const desktop = { viewport: { value: 'desktop' } };

const meta = {
  title: 'Capture/DropZone',
  component: DropZone,
  globals: desktop,
  decorators: [(Story) => <div style={{ maxWidth: 400 }}>{Story()}</div>],
} satisfies Meta<typeof DropZone>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Today's second column (D.1, OCT-16 E.1). */
export const Desktop: Story = {};
export const DesktopDark: Story = { globals: { ...desktop, theme: 'dark' } };
export const Russian: Story = { globals: { ...desktop, locale: 'ru' } };
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};
