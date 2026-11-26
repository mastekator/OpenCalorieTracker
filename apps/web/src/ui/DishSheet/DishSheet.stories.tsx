import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';
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

/** OCT-389: «How much you ate» for a product with a package, pieces and a serving. */
const cookies = {
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
} as const;
const amount = {
  original: {
    name: 'Oat cookies',
    grams: 200,
    kcal: 880,
    proteinG: 12,
    fatG: 32,
    carbsG: 136,
  },
  grams: 200,
  source: { kind: 'barcode', code: cookies.code },
  product: cookies,
  amount: { mode: 'pack', value: 1 },
} as const;
export const AmountPack: Story = { args: amount };
export const AmountPackDark: Story = {
  args: amount,
  globals: { theme: 'dark' },
};
export const AmountPackRussian: Story = {
  args: amount,
  globals: { locale: 'ru' },
};
export const AmountPackDesktop: Story = {
  args: amount,
  globals: { viewport: { value: 'desktop' } },
};
const pieces = {
  ...amount,
  grams: 33.3,
  amount: { mode: 'piece', value: 2 },
} as const;
export const AmountPieces: Story = { args: pieces };
export const AmountPiecesDark: Story = {
  args: pieces,
  globals: { theme: 'dark' },
};
const servings = {
  ...amount,
  grams: 45,
  amount: { mode: 'serving', value: 1.5 },
} as const;
export const AmountServings: Story = { args: servings };
export const AmountServingsRussian: Story = {
  args: servings,
  globals: { locale: 'ru' },
};
const grams = {
  ...amount,
  grams: 45,
  amount: { mode: 'weight', value: 45 },
} as const;
export const AmountGrams: Story = { args: grams };
export const AmountGramsDark: Story = {
  args: grams,
  globals: { theme: 'dark' },
};
/** A drink in ml, its last pick remembered: «same as last time». */
const juiceLast = { mode: 'pack', value: 0.25 } as const;
const juice = {
  ...amount,
  original: {
    name: 'Orange juice',
    grams: 250,
    kcal: 112.5,
    proteinG: 2,
    fatG: 0.5,
    carbsG: 25,
    unit: 'ml',
  },
  grams: 250,
  product: {
    ...cookies,
    name: 'Orange juice',
    per: 'ml',
    kcal100: 45,
    packG: 1000,
    servingG: 250,
    pieces: null,
    last: juiceLast,
  },
  amount: juiceLast,
} as const;
export const AmountMlLast: Story = { args: juice };
export const AmountMlLastDark: Story = {
  args: juice,
  globals: { theme: 'dark' },
};
export const AmountOunces: Story = { args: { ...amount, units: 'us' } };

/** A drink from a package (OCT-378 1.2): «Volume», «Unit from the package», per 100 ml. */
const drink = {
  original: {
    name: 'Orange juice',
    grams: 500,
    unit: 'ml',
    kcal: 225,
    proteinG: 4,
    fatG: 1,
    carbsG: 50,
  },
  grams: 500,
  source: { kind: 'barcode', code: '4601234567893', servingG: 250 },
} as const;
export const Millilitres: Story = { args: drink };
export const MillilitresDark: Story = {
  args: drink,
  globals: { theme: 'dark' },
};
export const FluidOunces: Story = { args: { ...drink, units: 'us' } };
export const FluidOuncesDark: Story = {
  args: { ...drink, units: 'us' },
  globals: { theme: 'dark' },
};
export const MillilitresRussian: Story = {
  args: drink,
  globals: { locale: 'ru' },
};
/** OCT-380 3.1: no package weight, no serving: «Pieces · Grams» and «Add package weight». */
const unknown = {
  ...amount,
  original: {
    name: 'Muesli bar',
    grams: 100,
    kcal: 400,
    proteinG: 5,
    fatG: 12,
    carbsG: 66,
  },
  grams: 100,
  product: {
    ...cookies,
    name: 'Muesli bar',
    kcal100: 400,
    packG: null,
    servingG: null,
    pieces: null,
  },
  amount: { mode: 'weight', value: 100 },
} as const;
// The sheet is a modal <dialog> outside the canvas.
const tap = (name: RegExp, role: 'button' | 'radio') =>
  async function play({ canvasElement }: { canvasElement: HTMLElement }) {
    const body = within(canvasElement.ownerDocument.body);
    (await body.findByRole(role, { name })).click();
  };
export const WeightUnknown: Story = { args: unknown };
export const WeightUnknownDark: Story = {
  args: unknown,
  globals: { theme: 'dark' },
};
/** 3.2: the package weight field. */
export const WeightUnknownAsked: Story = {
  args: unknown,
  play: tap(/Add package weight|Указать вес упаковки/, 'button'),
};
export const WeightUnknownAskedDark: Story = {
  ...WeightUnknownAsked,
  globals: { theme: 'dark' },
};
/** 3.3: «Pieces» with the count unknown asks it; without a weight, the weight first. */
const piecesUnknown = {
  ...amount,
  product: { ...cookies, pieces: null },
} as const;
export const PiecesUnknown: Story = {
  args: piecesUnknown,
  play: tap(/^(Pieces|Штуки)$/, 'radio'),
};
export const PiecesUnknownDark: Story = {
  ...PiecesUnknown,
  globals: { theme: 'dark' },
};
export const PiecesUnknownRussian: Story = {
  ...PiecesUnknown,
  globals: { locale: 'ru' },
};
export const PiecesAndWeightUnknown: Story = {
  args: unknown,
  play: tap(/^(Pieces|Штуки)$/, 'radio'),
};
export const PiecesAndWeightUnknownDark: Story = {
  ...PiecesAndWeightUnknown,
  globals: { theme: 'dark' },
};

/** OCT-420 2.1: a dish weighed with its skin: «Peeled · Whole», the gross weight, «Change %». */
const sapodilla = {
  original: {
    name: 'Sapodilla',
    grams: 617.6,
    kcal: 512.6,
    proteinG: 2.5,
    fatG: 6.8,
    carbsG: 123.5,
  },
  grams: 617.6,
  edible: {
    grossG: 772,
    pct: 80,
    source: 'ref' as const,
    key: 'sapodilla',
  },
};
export const Edible: Story = { args: sapodilla };
export const EdibleDark: Story = {
  args: sapodilla,
  globals: { theme: 'dark' },
};
export const EdibleRussian: Story = {
  args: {
    ...sapodilla,
    original: { ...sapodilla.original, name: 'Саподилла' },
  },
  globals: { locale: 'ru' },
};
export const EdibleDesktop: Story = {
  args: sapodilla,
  globals: { viewport: { value: 'desktop' } },
};
export const EdibleDesktopDark: Story = {
  args: sapodilla,
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
/** 2.2: «Whole» is 100 %; the label is just «Weight», the source block hides. */
const whole = {
  ...sapodilla,
  grams: 772,
  edible: { ...sapodilla.edible, whole: true as const, chosen: true as const },
};
export const EdibleWhole: Story = { args: whole };
export const EdibleWholeDark: Story = {
  args: whole,
  globals: { theme: 'dark' },
};
/** An AI estimate: grey source, sparkle in the source block. */
const aiShare = {
  ...sapodilla,
  grams: 193,
  edible: {
    grossG: 772,
    pct: 25,
    source: 'ai' as const,
    key: 'ice_cream_bean',
  },
};
export const EdibleAi: Story = { args: aiShare };
export const EdibleAiDark: Story = {
  args: aiShare,
  globals: { theme: 'dark' },
};
/** 2.3: «Change %» opens the share stepper with 90 · 75 · 50 · 25. */
export const EdibleChange: Story = {
  args: sapodilla,
  play: tap(/^(Change the percentage|Изменить процент)/, 'button'),
};
export const EdibleChangeDark: Story = {
  ...EdibleChange,
  globals: { theme: 'dark' },
};
export const EdibleChangeRussian: Story = {
  ...EdibleChange,
  args: EdibleRussian.args,
  globals: { locale: 'ru' },
};
export const EdibleChangeDesktop: Story = {
  ...EdibleChange,
  globals: { viewport: { value: 'desktop' } },
};
/** 2.4: 0 or over 100 typed: «10–100%», the result keeps the previous share. */
export const EdibleError: Story = {
  args: sapodilla,
  async play(ctx) {
    await EdibleChange.play!(ctx);
    const body = within(ctx.canvasElement.ownerDocument.body);
    const input = await body.findByRole('textbox', {
      name: /How much is edible|Сколько съедобно/,
    });
    await userEvent.clear(input);
    await userEvent.type(input, '0');
  },
};
export const EdibleErrorDark: Story = {
  ...EdibleError,
  globals: { theme: 'dark' },
};
export const EdibleErrorRussian: Story = {
  ...EdibleError,
  args: EdibleRussian.args,
  globals: { locale: 'ru' },
};
/** 1.2: grams set by hand in the row: the usual weight and «Restore». */
const manual = {
  ...sapodilla,
  grams: 300,
  edible: { ...sapodilla.edible, unlinked: true as const },
};
export const EdibleManual: Story = { args: manual };
export const EdibleManualDark: Story = {
  args: manual,
  globals: { theme: 'dark' },
};
export const EdibleManualRussian: Story = {
  args: { ...manual, original: EdibleRussian.args!.original! },
  globals: { locale: 'ru' },
};
export const EdibleManualRussianDark: Story = {
  ...EdibleManualRussian,
  globals: { locale: 'ru', theme: 'dark' },
};
