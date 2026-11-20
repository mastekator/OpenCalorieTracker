import type { Meta, StoryObj } from '@storybook/react-vite';
import { SourceBadge } from './SourceBadge';

const meta = {
  title: 'UI/SourceBadge',
  component: SourceBadge,
  args: { kind: 'barcode' },
  argTypes: {
    kind: { control: 'inline-radio', options: ['barcode', 'label', 'mine'] },
  },
} satisfies Meta<typeof SourceBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

export const Barcode: Story = {};
export const BarcodeDark: Story = { globals: dark };
export const Label: Story = { args: { kind: 'label' } };
export const LabelDark: Story = { args: { kind: 'label' }, globals: dark };
export const Mine: Story = { args: { kind: 'mine' } };
export const MineDark: Story = { args: { kind: 'mine' }, globals: dark };
