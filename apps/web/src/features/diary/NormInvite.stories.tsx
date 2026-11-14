import type { Meta, StoryObj } from '@storybook/react-vite';
import { NormInvite } from './NormInvite';

const meta = {
  title: 'Diary/NormInvite',
  component: NormInvite,
  args: { onSet: () => {} },
} satisfies Meta<typeof NormInvite>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};
export const Narrow: Story = { globals: { viewport: { value: 'iphoneSE' } } };
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
