import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { mealTypeAt, type MealType } from '@oct/shared';
import { MealTypeSegment } from './MealTypeSegment';

function Demo({ initial }: { initial: MealType }) {
  const [value, setValue] = useState(initial);
  return <MealTypeSegment value={value} onChange={setValue} />;
}

const meta = {
  title: 'UI/MealTypeSegment',
  component: Demo,
  args: { initial: mealTypeAt(new Date().getHours()) },
  argTypes: {
    initial: {
      control: 'inline-radio',
      options: ['breakfast', 'lunch', 'dinner', 'snack'],
    },
  },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Picked by the current hour, as the edit screen does (AC-3.10). */
export const ByTime: Story = {};
export const Breakfast: Story = { args: { initial: 'breakfast' } };
export const Snack: Story = { args: { initial: 'snack' } };
export const Dark: Story = {
  args: { initial: 'lunch' },
  globals: { theme: 'dark' },
};
/** Longest labels: «Завтрак · Обед · Ужин · Перекус» on 375 px. */
export const RussianSE: Story = {
  args: { initial: 'dinner' },
  globals: { locale: 'ru', viewport: { value: 'iphoneSE' } },
};
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};
