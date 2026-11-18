import { useState, type ComponentProps } from 'react';
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
  onIllustration,
  mark,
}: {
  dish: DishRowDish;
  units: Units;
  onDelete?: () => void;
  onIllustration?: () => void;
  mark?: ComponentProps<typeof DishRow>['mark'];
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
      onIllustration={onIllustration}
      mark={mark}
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
/** OCT-33: the illustration matched from the name, left of name and macros. */
export const Illustration: Story = {
  args: {
    dish: { ...rice, source: 'ai', confidence: 0.6, illustration: 'grains' },
  },
};
/** On the edit screen: a button with a pencil dot opens «Dish picture» (OCT-33 3.2). */
export const IllustrationEditable: Story = {
  args: { ...Illustration.args, onIllustration: fn() },
};
export const IllustrationEditableDark: Story = {
  ...IllustrationEditable,
  globals: { theme: 'dark' },
};
export const IllustrationDark: Story = {
  ...Illustration,
  globals: { theme: 'dark' },
};
export const IllustrationLongName: Story = {
  args: { dish: { ...LongName.args!.dish!, illustration: 'poultry-breast' } },
  globals: { viewport: { value: 'iphoneSE' } },
};
export const IllustrationDesktop: Story = {
  ...Illustration,
  globals: { viewport: { value: 'desktop' } },
};
/** After «Refine» (OCT-234 C.1): a new dish — accent-soft row and a filled «new». */
export const MarkNew: Story = { args: { mark: { kind: 'new' } } };
export const MarkNewDark: Story = { ...MarkNew, globals: { theme: 'dark' } };
/** A changed dish: outlined «changed» and the weight it had. */
export const MarkChanged: Story = {
  args: { mark: { kind: 'changed', name: rice.name, grams: 300 } },
};
export const MarkChangedDark: Story = {
  ...MarkChanged,
  globals: { theme: 'dark' },
};
/** Renamed by the AI: «was» shows the old name. */
export const MarkRenamed: Story = {
  args: {
    mark: { kind: 'changed', name: 'Sweet potato', grams: 150 },
    dish: { ...rice, source: 'ai', confidence: 0.6, illustration: 'grains' },
  },
};
export const MarkRenamedDark: Story = {
  ...MarkRenamed,
  globals: { theme: 'dark' },
};
