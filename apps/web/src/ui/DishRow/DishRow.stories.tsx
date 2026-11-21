import { useState, type ComponentProps } from 'react';
import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  amountGrams,
  scaleItem,
  type Amount,
  type Product,
  type Units,
} from '@oct/shared';
import { AiQuestion } from '../AiQuestion/AiQuestion';
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
  children,
  share,
}: {
  dish: DishRowDish;
  units: Units;
  onDelete?: () => void;
  onIllustration?: () => void;
  mark?: ComponentProps<typeof DishRow>['mark'];
  children?: ComponentProps<typeof DishRow>['children'];
  /** A package share instead of grams (OCT-389). */
  share?: { product: Product; amount: Amount };
}) {
  const [row, setRow] = useState(dish);
  const [amount, setAmount] = useState(share?.amount);
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
      share={
        share &&
        amount && {
          product: share.product,
          amount,
          onChange: (a) => {
            setAmount(a);
            setRow({
              ...scaleItem(original, amountGrams(share.product, a)),
              confidence: undefined,
            });
          },
        }
      }
    >
      {children}
    </DishRow>
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
/** Package numbers (OCT-313 §2): a source badge in place of the confidence one. */
export const Barcode: Story = {
  args: { dish: { ...rice, name: 'Greek yogurt 2%', source: 'barcode' } },
};
export const BarcodeDark: Story = { ...Barcode, globals: { theme: 'dark' } };
export const Label: Story = {
  args: { dish: { ...rice, name: 'Granola bar', source: 'label' } },
};
export const LabelDark: Story = { ...Label, globals: { theme: 'dark' } };
export const Mine: Story = {
  args: {
    dish: { ...rice, name: 'Home kefir', source: 'barcode', mine: true },
  },
};
export const MineDark: Story = { ...Mine, globals: { theme: 'dark' } };
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
/** A long old name takes its own line under the stepper, two lines at most (C.1). */
export const MarkRenamedLong: Story = {
  args: {
    mark: {
      kind: 'changed',
      name: 'Roasted sweet potato with rosemary and olive oil',
      grams: 150,
    },
  },
};
export const MarkRenamedLongDark: Story = {
  ...MarkRenamedLong,
  globals: { theme: 'dark' },
};
/** A 320 px phone: no room beside the stepper, «was» takes a line under it. */
export const MarkChangedNarrow: Story = {
  ...MarkChanged,
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
};
export const MarkChangedNarrowDark: Story = {
  ...MarkChangedNarrow,
  globals: { theme: 'dark' },
};
/** An answer chip (OCT-234 H.2): same weight, other numbers — «was» shows the old kcal; the question under the weight. */
export const MarkKcalWithQuestion: Story = {
  args: {
    mark: { kind: 'changed', name: rice.name, grams: 150, kcal: 420 },
    children: (
      <AiQuestion
        text="What’s in it?"
        options={[{ label: 'Oil' }, { label: 'No oil' }]}
        guess={0}
        chosen={1}
        onChoose={fn()}
        onOther={fn()}
      />
    ),
  },
};
export const MarkKcalWithQuestionDark: Story = {
  ...MarkKcalWithQuestion,
  globals: { theme: 'dark' },
};
/** OCT-383 1.1: another barcode read on the package, the sheet offers it. */
export const OtherBarcode: Story = {
  args: {
    dish: { ...rice, name: 'Iced lemon tea', source: 'barcode', check: true },
  },
};
export const OtherBarcodeDark: Story = {
  ...OtherBarcode,
  globals: { theme: 'dark' },
};

/** OCT-389: a barcode dish counted in shares of its package: «1 pack · 200 g», ± in the mode. */
const cookies: Product = {
  code: '4607012345678',
  name: 'Oat cookies',
  brand: null,
  kcal100: 440,
  protein100: 6,
  fat100: 16,
  carbs100: 68,
  per: 'g',
  servingG: 30,
  servingText: null,
  packG: 200,
  pieces: 12,
};
const cookieDish = {
  name: 'Oat cookies',
  grams: 200,
  kcal: 880,
  proteinG: 12,
  fatG: 32,
  carbsG: 136,
  source: 'barcode',
} as const;
export const SharePack: Story = {
  args: {
    dish: cookieDish,
    share: { product: cookies, amount: { mode: 'pack', value: 1 } },
  },
};
export const SharePackDark: Story = {
  ...SharePack,
  globals: { theme: 'dark' },
};
/** Repeat scan: the remembered «2 of 12», tagged «same as last time» until changed. */
const last = { mode: 'piece', value: 2 } as const;
const piecesArgs = {
  dish: { ...cookieDish, ...scaleItem(cookieDish, 33.3) },
  share: { product: { ...cookies, last }, amount: last },
};
export const SharePiecesLast: Story = { args: piecesArgs };
export const SharePiecesLastDark: Story = {
  args: piecesArgs,
  globals: { theme: 'dark' },
};
export const SharePiecesRussian: Story = {
  args: piecesArgs,
  globals: { locale: 'ru' },
};
export const ShareDesktop: Story = {
  ...SharePack,
  globals: { viewport: { value: 'desktop' } },
};
