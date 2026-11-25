import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within } from 'storybook/test';
import { EdibleBlock, EdibleSource } from './EdibleBlock';

const original = {
  grams: 617.6,
  kcal: 512.6,
  proteinG: 2.5,
  fatG: 6.8,
  carbsG: 123.5,
};

// Live: every change shows as in the dish sheet.
function Demo(props: Omit<ComponentProps<typeof EdibleBlock>, 'onChange'>) {
  const [edible, setEdible] = useState(props.edible);
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: 420 }}>
      <EdibleBlock {...props} edible={edible} onChange={setEdible} />
      <EdibleSource edible={edible} original={original} />
    </div>
  );
}

const meta = {
  title: 'UI/EdibleBlock',
  component: Demo,
  args: {
    edible: { grossG: 772, pct: 80, source: 'ref', key: 'sapodilla' },
    name: 'Sapodilla',
    units: 'metric',
  },
  argTypes: { units: { control: 'inline-radio', options: ['metric', 'us'] } },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** OCT-420 2.1: peeled, the USDA share. */
export const Peeled: Story = {};
export const PeeledDark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = {
  args: { name: 'Саподилла' },
  globals: { locale: 'ru' },
};
/** 2.2: «Whole». */
export const Whole: Story = {
  args: {
    edible: {
      grossG: 180,
      pct: 90,
      source: 'ref',
      key: 'apple',
      whole: true,
      chosen: true,
    },
    name: 'Apple',
  },
};
export const WholeDark: Story = { ...Whole, globals: { theme: 'dark' } };
/** An AI estimate, a banana-like odd share: the first − / + goes to the next 5. */
export const AiOddShare: Story = {
  args: {
    edible: { grossG: 200, pct: 64, source: 'ai', key: 'banana' },
    name: 'Banana',
  },
  async play({ canvasElement }) {
    (
      await within(canvasElement).findByRole('button', {
        name: /^Change the percentage/,
      })
    ).click();
  },
};
export const AiOddShareDark: Story = {
  ...AiOddShare,
  globals: { theme: 'dark' },
};
