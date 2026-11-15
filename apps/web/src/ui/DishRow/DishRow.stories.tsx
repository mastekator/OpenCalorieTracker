import { useState } from 'react';
import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { scaleItem, type Units } from '@oct/shared';
import { DishRow, type DishRowDish } from './DishRow';

const rice = {
  name: 'Rice with vegetables',
  grams: 150,
  kcal: 300,
  proteinG: 8,
  fatG: 6,
  carbsG: 36,
};

// Recalculates from the original values like the edit screen; an edit drops the badge (AC-2.9).
function Demo({
  dish,
  units,
  onDelete,
}: {
  dish: DishRowDish;
  units: Units;
  onDelete?: () => void;
}) {
  const [row, setRow] = useState(dish);
  const original = { ...dish, grams: dish.grams ?? 1 };
  return (
    <DishRow
      dish={row}
      units={units}
      onGramsChange={(grams) =>
        setRow(
          grams === null
            ? { ...row, grams: null }
            : { ...scaleItem(original, grams), confidence: undefined },
        )
      }
      onEdit={() => {}}
      onDelete={onDelete}
    />
  );
}

const meta = {
  title: 'UI/DishRow',
  component: Demo,
  args: {
    dish: { ...rice, source: 'ai', confidence: 0.6 },
    units: 'metric',
    onDelete: fn(),
  },
  argTypes: { units: { control: 'inline-radio', options: ['metric', 'us'] } },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AiMedium: Story = {};
export const AiExact: Story = {
  args: {
    dish: {
      name: 'Boiled eggs, 3',
      grams: 150,
      kcal: 233,
      proteinG: 19,
      fatG: 16,
      carbsG: 1,
      source: 'ai',
      confidence: 0.98,
    },
  },
};
export const AiHigh: Story = {
  args: { dish: { ...rice, source: 'ai', confidence: 0.88 } },
};
export const AiLow: Story = {
  args: { dish: { ...rice, source: 'ai', confidence: 0.3 } },
};
export const Manual: Story = { args: { dish: { ...rice, source: 'manual' } } };
export const History: Story = {
  args: { dish: { ...rice, source: 'history' } },
};
/** Weight field empty: danger border and hint, numbers stay as last valid. */
export const WeightError: Story = {
  args: { dish: { ...rice, grams: null, source: 'ai', confidence: 0.6 } },
};
export const Ounces: Story = { args: { units: 'us' } };
export const LongName: Story = {
  args: {
    dish: {
      ...rice,
      name: 'Chicken breast fillet baked with herbs, lemon and garlic sauce',
      source: 'ai',
      confidence: 0.3,
    },
  },
  globals: { viewport: { value: 'iphoneSE' } },
};
export const Dark: Story = { globals: { theme: 'dark' } };
export const ErrorDark: Story = { ...WeightError, globals: { theme: 'dark' } };
export const Russian: Story = {
  args: {
    dish: {
      ...rice,
      name: 'Рис с овощами',
      source: 'ai',
      confidence: 0.3,
    },
  },
  globals: { locale: 'ru' },
};
/** §5: trash next to the pencil; on the phone swipe left (touch) or Tab to «Delete». */
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
export const DesktopDark: Story = {
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
