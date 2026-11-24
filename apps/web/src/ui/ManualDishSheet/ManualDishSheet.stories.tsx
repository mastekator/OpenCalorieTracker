import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, fn, within } from 'storybook/test';
import type { Recipe, Units } from '@oct/shared';
import type { BarcodeResult } from '../../data/products';
import { PILAF, RECIPES } from '../../features/kitchen/fixtures';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { BASIS_KEY, ManualDishSheet, type ManualDish } from './ManualDishSheet';

// Opens on load; the button reopens it so focus return is visible.
function Demo(props: {
  units: Units;
  name?: string;
  title?: string;
  onAdd: (dish: ManualDish) => void;
  recipes?: Recipe[];
  onRecipe?: (recipe: Recipe) => void;
  lookup?: (code: string) => Promise<BarcodeResult>;
  barcode?: string;
  photoNotFound?: 'admin' | 'user';
  amountTitle?: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button variant="tonal" onClick={() => setOpen(true)}>
        {t('manual_dish.title')}
      </Button>
      {open && (
        <ManualDishSheet
          units={props.units}
          name={props.name}
          title={props.title}
          recipes={props.recipes}
          onRecipe={props.onRecipe}
          lookup={props.lookup}
          barcode={props.barcode}
          photoNotFound={props.photoNotFound}
          amountTitle={props.amountTitle}
          onAdd={(dish) => {
            props.onAdd(dish);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const meta = {
  title: 'UI/ManualDishSheet',
  component: Demo,
  args: { units: 'metric', onAdd: fn() },
  argTypes: { units: { control: 'inline-radio', options: ['metric', 'us'] } },
  // Every story starts on «Per 100 g»; the choice is remembered on the device.
  beforeEach: () => localStorage.removeItem(BASIS_KEY),
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Fills fields by the start of their label; the sheet is a modal dialog outside the canvas. */
const fill =
  (
    values: Record<string, string>,
    then?: (body: HTMLElement) => Promise<void>,
  ) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const body = canvasElement.ownerDocument.body;
    const dialog = within(body);
    for (const [label, value] of Object.entries(values))
      fireEvent.change(await dialog.findByLabelText(new RegExp(`^${label}`)), {
        target: { value },
      });
    await then?.(body);
  };
const add = async (body: HTMLElement) =>
  (
    await within(body).findByRole('button', { name: /^(Add|Добавить)$/ })
  ).click();
const perServing = async (body: HTMLElement) =>
  (
    await within(body).findByRole('radio', {
      name: /^(Per serving|На порцию)$/,
    })
  ).click();
const milliliters = async (body: HTMLElement) =>
  (
    await within(body).findByRole('radio', {
      name: /^(Milliliters|Миллилитры)$/,
    })
  ).click();

const dark = { theme: 'dark' };
const filled = {
  Name: 'Cottage cheese 5%',
  'Weight ·': '250',
  'Calories ·': '121',
  Protein: '17',
  Fat: '5',
  Carbs: '1,8',
};
const mismatch = { ...filled, 'Calories ·': '300' };

export const Empty: Story = {};
export const EmptyDark: Story = { globals: dark };
/** «Add» with nothing filled: errors on name, weight and calories. */
export const Errors: Story = { play: fill({}, add) };
export const ErrorsDark: Story = { play: fill({}, add), globals: dark };
/** «abc» is not a number (AC-5.4). */
export const NotANumber: Story = {
  play: fill({ ...filled, Fat: 'abc' }, add),
};
/** Per 100 g: the «Total for …» line. */
export const Per100: Story = { play: fill(filled) };
export const Per100Dark: Story = { play: fill(filled), globals: dark };
/** Per serving: what is entered is the total, no line. */
export const PerServing: Story = { play: fill(filled, perServing) };
export const PerServingDark: Story = {
  play: fill(filled, perServing),
  globals: dark,
};
/** Kcal and macros differ by more than 30 %: a soft warning, «Add» still works. */
export const Mismatch: Story = { play: fill(mismatch) };
export const MismatchDark: Story = { play: fill(mismatch), globals: dark };
export const Ounces: Story = {
  args: { units: 'us' },
  play: fill({ ...filled, 'Weight ·': '8,8' }),
};
export const Desktop: Story = {
  play: fill(filled),
  globals: { viewport: { value: 'desktop' } },
};
export const DesktopDark: Story = {
  play: fill(filled),
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
export const Russian: Story = { globals: { locale: 'ru' } };
/** From the recipe's ingredient search: the typed text is the name. */
export const Prefilled: Story = {
  args: { name: 'Carrots', title: 'Ingredient, manually' },
};

/** Two recipes named alike: kcal per 100 g tells them apart (OCT-160 3.4). */
const recipes: Recipe[] = [
  ...RECIPES,
  { ...PILAF, id: 9, cookedG: 2600, lastLoggedAt: '2026-11-17T12:00:00.000Z' },
];
const withRecipes = { recipes, onRecipe: fn() };
const search = fill({ Name: 'pil' });
/** «My recipes · recent» before typing: the 3 last logged. */
export const Recipes: Story = { args: withRecipes };
export const RecipesDark: Story = { args: withRecipes, globals: dark };
/** Typing: matching recipes first, with the badge. */
export const RecipesSearch: Story = { args: withRecipes, play: search };
export const RecipesSearchDark: Story = {
  args: withRecipes,
  play: search,
  globals: dark,
};
export const RecipesDesktop: Story = {
  args: withRecipes,
  globals: { viewport: { value: 'desktop' } },
};
export const RecipesRussian: Story = {
  args: withRecipes,
  globals: { locale: 'ru' },
};

/** OCT-313 3.2 / 5.2, OCT-418: digits → Enter → «How much you ate» instead of the weight and per 100 g. */
const withBarcode = {
  lookup: async (code: string): Promise<BarcodeResult> => ({
    product: {
      code,
      name: 'Greek yogurt 2%',
      brand: null,
      kcal100: 66,
      protein100: 8,
      fat100: 2,
      carbs100: 4,
      per: 'g',
      servingG: 140,
      servingText: '140 g',
    },
    from: 'off',
    off: 'found',
  }),
};
const scan = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const field = await within(canvasElement.ownerDocument.body).findByLabelText(
    /^(Barcode|Штрихкод)$/,
  );
  fireEvent.change(field, { target: { value: '4607012345677' } });
  fireEvent.keyDown(field, { key: 'Enter' });
};
export const Barcode: Story = { args: withBarcode };
export const BarcodeDark: Story = { args: withBarcode, globals: dark };
export const BarcodeFound: Story = { args: withBarcode, play: scan };
export const BarcodeFoundDark: Story = {
  args: withBarcode,
  play: scan,
  globals: dark,
};
export const BarcodeDesktop: Story = {
  args: withBarcode,
  play: scan,
  globals: { viewport: { value: 'desktop' } },
};

/** OCT-441: a recipe ingredient — «How much you used» instead of «How much you ate». */
const inRecipe = {
  ...withBarcode,
  title: 'Ingredient, manually',
  amountTitle: 'How much you used',
};
export const RecipeFound: Story = { args: inRecipe, play: scan };
export const RecipeFoundDark: Story = {
  args: inRecipe,
  play: scan,
  globals: dark,
};
export const RecipeFoundDesktop: Story = {
  args: inRecipe,
  play: scan,
  globals: { viewport: { value: 'desktop' } },
};

/** OCT-418: a known package with pieces — Package · Servings · Pieces · Grams. */
const withPack = {
  lookup: async (code: string): Promise<BarcodeResult> => {
    const found = await withBarcode.lookup(code);
    return {
      ...found,
      product: {
        ...found.product!,
        name: 'Oat cookies',
        kcal100: 450,
        servingG: 25,
        packG: 300,
        pieces: 12,
      },
    };
  },
};
export const BarcodeFoundPack: Story = { args: withPack, play: scan };
export const BarcodeFoundPackDark: Story = {
  args: withPack,
  play: scan,
  globals: dark,
};
export const BarcodeFoundPackRussian: Story = {
  args: withPack,
  play: scan,
  globals: { locale: 'ru' },
};

/** OCT-378 2.2: the user's own product in ml — «Volume», «Per 100 ml», the total in ml. */
const kefir = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const body = canvasElement.ownerDocument.body;
  await milliliters(body);
  await fill({ Name: 'Kefir 1%', 'Volume ·': '250', 'Calories ·': '40' })({
    canvasElement,
  });
};
export const Milliliters: Story = { play: kefir };
export const MillilitersDark: Story = { play: kefir, globals: dark };
export const MillilitersOunces: Story = { args: { units: 'us' }, play: kefir };

/** OCT-378 2.4: the empty-field error follows the unit. */
const noVolume = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const body = canvasElement.ownerDocument.body;
  await milliliters(body);
  await add(body);
};
export const VolumeError: Story = { play: noVolume };
export const VolumeErrorDark: Story = { play: noVolume, globals: dark };

/** OCT-378 2.3: found per ml without kcal — no switch, the unit comes from the package. */
const withJuice = {
  lookup: async (code: string): Promise<BarcodeResult> => ({
    product: {
      code,
      name: 'Orange juice',
      brand: null,
      kcal100: null,
      protein100: null,
      fat100: null,
      carbs100: null,
      per: 'ml',
      servingG: 250,
      servingText: '250 ml',
    },
    from: 'off',
    off: 'found',
  }),
};
export const UnitFromPackage: Story = { args: withJuice, play: scan };
export const UnitFromPackageDark: Story = {
  args: withJuice,
  play: scan,
  globals: dark,
};

/** OCT-313 3.4: no AI, the photo's barcode not found — the sheet opens with it. */
const fromPhoto = {
  ...withBarcode,
  barcode: '4607012345677',
  photoNotFound: 'user',
} as const;
export const PhotoNotFound: Story = { args: fromPhoto };
export const PhotoNotFoundDark: Story = { args: fromPhoto, globals: dark };
export const PhotoNotFoundAdmin: Story = {
  args: { ...fromPhoto, photoNotFound: 'admin' },
};
export const PhotoNotFoundRussian: Story = {
  args: fromPhoto,
  globals: { locale: 'ru' },
};

/** OCT-419 (OCT-380 5.2): a code not found — optional package weight and pieces, remembered for it. */
const withMissing = {
  lookup: async (): Promise<BarcodeResult> => ({
    product: null,
    from: null,
    off: 'missing',
  }),
};
const packFields =
  (values: Record<string, string>, then?: typeof add) =>
  async (ctx: { canvasElement: HTMLElement }) => {
    await scan(ctx);
    await fill(values, then)(ctx);
  };
const pack = packFields({
  ...filled,
  'Package weight|Вес упаковки': '400',
  'How many pieces|Сколько штук': '8',
});
const badPack = packFields(
  {
    ...filled,
    'Package weight|Вес упаковки': '6000',
    'How many pieces|Сколько штук': '2,5',
  },
  add,
);
export const NotFoundPack: Story = { args: withMissing, play: pack };
export const NotFoundPackDark: Story = {
  args: withMissing,
  play: pack,
  globals: dark,
};
export const NotFoundPackOunces: Story = {
  args: { ...withMissing, units: 'us' },
  play: packFields({
    ...filled,
    'Weight ·': '8,8',
    'Package weight|Вес упаковки': '14',
  }),
};
export const NotFoundPackErrors: Story = { args: withMissing, play: badPack };
export const NotFoundPackErrorsDark: Story = {
  args: withMissing,
  play: badPack,
  globals: dark,
};
export const NotFoundPackRussian: Story = {
  args: withMissing,
  play: scan,
  globals: { locale: 'ru' },
};
