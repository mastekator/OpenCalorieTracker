import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, within } from 'storybook/test';
import type { Drink } from '@oct/shared';
import { CustomDrinkSheet } from './CustomDrinkSheet';

const beer: Drink = {
  id: 3,
  name: 'Beer',
  illustration: 'drinks',
  kcal: 43,
  proteinG: 0.5,
  fatG: 0,
  carbsG: 3.6,
  countsWater: false,
  deleted: false,
};

const meta = {
  title: 'Screens/Water/CustomDrinkSheet',
  component: CustomDrinkSheet,
  args: {
    online: true,
    onSave: async () => {},
    onDelete: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof CustomDrinkSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const save = async () => {
  const body = within(document.body);
  fireEvent.click(await body.findByRole('button', { name: /Save|Сохранить/ }));
};

/** 3.4: a new drink, empty fields are 0. */
export const New: Story = {};
export const NewDark: Story = { globals: dark };
/** 3.4: «Save» with an empty name — the name is marked. */
export const NameError: Story = { play: save };
export const NameErrorDark: Story = { ...NameError, globals: dark };
/** 3.5: an own drink not counted as water, with «Delete drink». */
export const Edit: Story = { args: { drink: beer } };
export const EditDark: Story = { ...Edit, globals: dark };
/** 3.5 offline: «Save» and «Delete drink» off, the reason above the button. */
export const Offline: Story = { args: { drink: beer, online: false } };
export const OfflineDark: Story = { ...Offline, globals: dark };
/** The server refused or the network dropped: the sheet stays with an error. */
export const SaveError: Story = {
  args: { drink: beer, onSave: () => Promise.reject<void>(new Error('500')) },
  play: save,
};
export const SaveErrorDark: Story = { ...SaveError, globals: dark };
