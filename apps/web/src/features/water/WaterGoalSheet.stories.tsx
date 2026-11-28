import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, within } from 'storybook/test';
import { WaterGoalSheet } from './WaterGoalSheet';

const meta = {
  title: 'Screens/Water/WaterGoalSheet',
  component: WaterGoalSheet,
  args: {
    goalMl: 2000,
    manual: false,
    referenceMl: 2000,
    units: 'metric',
    onSave: async () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof WaterGoalSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const type = (text: string) => async () => {
  const field = await within(document.body).findByRole('textbox');
  fireEvent.change(field, { target: { value: text } });
};

/** 4.1: the reference as a placeholder, the disclaimer under the field. */
export const Reference: Story = {};
export const ReferenceDark: Story = { ...Reference, globals: dark };
/** 4.2: a manual goal and «Reset to the reference». */
export const Manual: Story = { args: { goalMl: 2500, manual: true } };
export const ManualDark: Story = { ...Manual, globals: dark };
export const ManualRussian: Story = { ...Manual, globals: { locale: 'ru' } };
/** Out of 500–6,000 ml: the range turns red, «Save» off (as 2.2). */
export const OutOfRange: Story = { play: type('7000') };
export const OutOfRangeDark: Story = { ...OutOfRange, globals: dark };
/** US units: «From 16.9 to 202.9 fl oz», stored in ml. */
export const FluidOunces: Story = {
  args: { units: 'us', goalMl: 2500, manual: true },
};
/** The server did not answer: the sheet stays open with an error. */
export const SaveFailed: Story = {
  args: {
    goalMl: 2500,
    manual: true,
    onSave: () => Promise.reject<void>(new Error()),
  },
  play: async () => {
    fireEvent.click(
      await within(document.body).findByRole('button', {
        name: /Save|Сохранить/,
      }),
    );
  },
};
export const SaveFailedDark: Story = { ...SaveFailed, globals: dark };
