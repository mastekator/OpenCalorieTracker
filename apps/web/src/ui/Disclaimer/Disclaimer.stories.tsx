import type { Meta, StoryObj } from '@storybook/react-vite';
import { Disclaimer } from './Disclaimer';

const meta = {
  title: 'UI/Disclaimer',
  component: Disclaimer,
} satisfies Meta<typeof Disclaimer>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Before the first saved norm and for under-18s (8.12): no close button. */
export const Fixed: Story = {};
export const Closable: Story = { args: { onHide: () => {} } };
export const CloseFocusVisible: Story = {
  ...Closable,
  parameters: { pseudo: { focusVisible: true } },
};
/** Another notice in the same look: the water reference (OCT-147 4.1). */
export const CustomText: Story = {
  args: {
    text: 'EFSA reference for adults, counting water from food. Not medical advice.',
  },
};
