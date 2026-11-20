import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecognitionSteps } from './RecognitionSteps';

const meta = {
  title: 'UI/RecognitionSteps',
  component: RecognitionSteps,
  args: {
    label: 'Recognition steps',
    marks: {
      wait: 'waiting',
      run: 'in progress',
      done: 'done',
      skip: 'skipped',
      warn: 'failed',
    },
    steps: [
      { title: 'Barcode', caption: '4607012345678', mark: 'done' },
      {
        title: 'Open Food Facts',
        caption: 'Not responding — reading the label',
        mark: 'warn',
      },
      {
        title: 'AI reads the photo',
        caption: 'Nutrition table on the package and the rest of the food',
        mark: 'run',
      },
    ],
  },
} satisfies Meta<typeof RecognitionSteps>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** done · warn · run */
export const Marks: Story = {};
export const MarksDark: Story = { globals: dark };

/** run · wait · skip */
const waiting = {
  steps: [
    { title: 'Barcode', mark: 'run' },
    { title: 'Open Food Facts', mark: 'wait' },
    { title: 'AI reads the photo', caption: 'AI isn’t set up', mark: 'skip' },
  ],
} as const;
export const Waiting: Story = {
  args: { ...waiting, steps: [...waiting.steps] },
};
export const WaitingDark: Story = {
  args: { ...waiting, steps: [...waiting.steps] },
  globals: dark,
};
