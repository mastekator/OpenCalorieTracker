import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import type { BarcodeResult } from '../../data/products';
import { DishSheet } from './DishSheet';

type Props = Omit<
  ComponentProps<typeof DishSheet>,
  'onClose' | 'onDone' | 'onDelete'
> & {
  onDone: (name: string, grams: number) => void;
  onDelete: () => void;
};

// Opens on load; the button reopens it so focus return is visible.
function Demo(props: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button variant="tonal" onClick={() => setOpen(true)}>
        {t('edit.dish.title')}
      </Button>
      {open && (
        <DishSheet
          {...props}
          onDone={(name, grams) => {
            props.onDone(name, grams);
            setOpen(false);
          }}
          onDelete={() => {
            props.onDelete();
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const meta = {
  title: 'UI/DishSheet',
  component: Demo,
  args: {
    original: {
      name: 'Rice with vegetables',
      grams: 150,
      kcal: 300,
      proteinG: 8,
      fatG: 6,
      carbsG: 36,
    },
    grams: 150,
    units: 'metric',
    onDone: fn(),
    onDelete: fn(),
  },
  argTypes: { units: { control: 'inline-radio', options: ['metric', 'us'] } },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 4.4: clear the name and press Done to see «Enter a name»; the numbers follow the weight only. */
export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
export const Ounces: Story = { args: { units: 'us' } };
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
export const DesktopDark: Story = {
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
export const Russian: Story = {
  args: {
    original: {
      name: 'Рис с овощами',
      grams: 150,
      kcal: 300,
      proteinG: 8,
      fatG: 6,
      carbsG: 36,
    },
  },
  globals: { locale: 'ru' },
};

/** 2.6: a package found by barcode — its serving under the weight and the Open Food Facts credit. */
const yogurt = {
  original: {
    name: 'Greek yogurt 2%',
    grams: 140,
    kcal: 92.4,
    proteinG: 11.2,
    fatG: 2.8,
    carbsG: 5.6,
  },
  grams: 140,
  source: { kind: 'barcode', code: '4607012345677', servingG: 140 },
} as const;
export const Package: Story = { args: yogurt };
export const PackageDark: Story = { args: yogurt, globals: { theme: 'dark' } };
const label = {
  ...yogurt,
  source: { kind: 'label', code: '4607012345677' },
} as const;
export const PackageLabel: Story = { args: label };
export const PackageLabelDark: Story = {
  args: label,
  globals: { theme: 'dark' },
};
const mine = {
  ...yogurt,
  source: {
    kind: 'mine',
    code: '4607012345677',
    savedAt: '2026-11-02T10:00:00Z',
  },
} as const;
export const PackageMine: Story = { args: mine };
export const PackageMineDark: Story = {
  args: mine,
  globals: { theme: 'dark' },
};

/** OCT-383: another barcode on the package; «Replace» swaps the draft, «Close» drops it. */
const I = '8997035601383';
const pocari = {
  code: I,
  name: 'Pocari Ion Water 500ml',
  brand: null,
  kcal100: 11,
  protein100: 0,
  fat100: 0,
  carbs100: 2.7,
  per: 'ml',
  servingG: 500,
  servingText: null,
} as const;
const tea = {
  original: {
    name: 'Iced lemon tea',
    grams: 500,
    kcal: 150,
    proteinG: 0,
    fatG: 0,
    carbsG: 37.5,
  },
  grams: 500,
  source: { kind: 'barcode', code: '4991433601383' },
  alt: { code: I, product: pocari, from: 'off' },
} as const;
export const OtherCode: Story = { args: tea };
export const OtherCodeDark: Story = { args: tea, globals: { theme: 'dark' } };
export const OtherCodeRussian: Story = { args: tea, globals: { locale: 'ru' } };
export const OtherCodeDesktop: Story = {
  args: tea,
  globals: { viewport: { value: 'desktop' } },
};
/** No product: «Replace» searches (3 s here), then «not found». */
const noProduct = {
  ...tea,
  original: { ...tea.original, name: 'Ion drink', kcal: 55, carbsG: 13.5 },
  source: { kind: 'label', code: '4991433601383' },
  alt: { code: I, product: null },
  lookup: () =>
    new Promise<BarcodeResult>((resolve) =>
      setTimeout(
        () => resolve({ product: null, from: null, off: 'missing' }),
        3000,
      ),
    ),
} as const;
export const OtherCodeNoProduct: Story = { args: noProduct };
export const OtherCodeNoProductDark: Story = {
  args: noProduct,
  globals: { theme: 'dark' },
};
/** 3.4: an AI estimate gets a short «Barcode» block; offline answer. */
const ai = {
  ...noProduct,
  original: { ...noProduct.original, name: 'Drink' },
  source: { kind: 'code', code: '4991433601383' },
  lookup: async (): Promise<BarcodeResult> => ({
    product: null,
    from: null,
    off: 'offline',
  }),
} as const;
export const OtherCodeAi: Story = { args: ai };
export const OtherCodeAiDark: Story = { args: ai, globals: { theme: 'dark' } };
