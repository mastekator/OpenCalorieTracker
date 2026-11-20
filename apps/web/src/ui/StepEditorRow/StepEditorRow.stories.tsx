import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { List } from '../List/List';
import { StepEditorRow } from './StepEditorRow';

const meta = {
  title: 'UI/StepEditorRow',
  component: StepEditorRow,
  decorators: [(Story) => <List>{Story()}</List>],
  args: {
    index: 0,
    text: 'Dice the meat into 2–3 cm cubes, cut the carrots into strips and the onion into half rings.',
    photoId: null,
    onTextChange: fn(),
    onPhoto: fn(),
    onMenu: fn(),
    onMove: fn(),
  },
} satisfies Meta<typeof StepEditorRow>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** No photo: «Photo». */
export const Default: Story = {};
export const DefaultDark: Story = { globals: dark };
/** With a photo: its thumbnail and «Replace». */
export const WithPhoto: Story = {
  args: { index: 1, photoId: 'spaghetti.jpg' },
};
export const WithPhotoDark: Story = { ...WithPhoto, globals: dark };
/** A photo is uploading: its button is disabled. */
export const Uploading: Story = { args: { busy: true } };
export const UploadingDark: Story = { args: { busy: true }, globals: dark };
/** Just added: empty and focused, the placeholder shows. */
export const Empty: Story = { args: { index: 3, text: '', autoFocus: true } };
export const EmptyDark: Story = { ...Empty, globals: dark };
/** A photo but no text blocked Save: the error under the text. */
export const Error: Story = {
  args: {
    index: 1,
    text: '',
    photoId: 'spaghetti.jpg',
    error: 'Add text to step 2',
  },
};
export const ErrorDark: Story = { ...Error, globals: dark };
export const LongText: Story = {
  args: {
    text: 'Add the onion, after 5 minutes the carrots. Fry 7 more minutes, salt, add cumin. Pour in boiling water to cover by a finger, simmer 40 minutes on low heat with the lid on, then add the washed rice and level it without stirring.',
  },
};
