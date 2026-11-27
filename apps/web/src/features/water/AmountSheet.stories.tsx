import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, within } from 'storybook/test';
import { AmountSheet } from './AmountSheet';
import { useRow } from './fixtures';

const meta = {
  title: 'Screens/Water/AmountSheet',
  component: AmountSheet,
  args: { drink: null, units: 'metric', onClose: () => {}, onAdd: () => {} },
  // «Coffee with milk» in the story locale.
  render: function Render(args) {
    return <AmountSheet {...args} drink={useRow()[1]!} />;
  },
} satisfies Meta<typeof AmountSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const type = (text: string) => async () => {
  const field = await within(document.body).findByRole('textbox');
  fireEvent.change(field, { target: { value: text } });
};

/** 2.1: empty — the range in grey, «Add» off. */
export const Empty: Story = {};
/** 2.1: 300 ml — its kcal and macros before logging. */
export const Typed: Story = { play: type('300') };
export const TypedDark: Story = { ...Typed, globals: dark };
export const TypedRussian: Story = { ...Typed, globals: { locale: 'ru' } };
/** 2.2: over 2,000 ml — the range turns red, «Add» off. */
export const OutOfRange: Story = { play: type('2500') };
export const OutOfRangeDark: Story = { ...OutOfRange, globals: dark };
/** 2.2: US units — «From 0.3 to 67.6 fl oz», stored in ml. */
export const FluidOunces: Story = { args: { units: 'us' }, play: type('10') };
