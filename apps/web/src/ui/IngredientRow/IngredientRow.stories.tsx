import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { List } from '../List/List';
import { IngredientRow } from './IngredientRow';

const meta = {
  title: 'UI/IngredientRow',
  component: IngredientRow,
  decorators: [(Story) => <List>{Story()}</List>],
  args: {
    name: 'Long-grain rice',
    kcal: 1440,
    grams: '400',
    onGramsChange: fn(),
    onEdit: fn(),
  },
} satisfies Meta<typeof IngredientRow>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

export const Default: Story = {};
export const DefaultDark: Story = { globals: dark };
/** Salt, spices «to taste»: 0 g is allowed and not counted. */
export const ZeroGrams: Story = {
  args: { name: 'Salt', kcal: 0, grams: '0' },
};
export const Invalid: Story = {
  args: { grams: '-5', error: 'From 0 to 5,000 g' },
};
export const InvalidDark: Story = {
  args: { grams: '-5', error: 'From 0 to 5,000 g' },
  globals: dark,
};
export const Ounces: Story = { args: { grams: '8.8', units: 'us' } };
export const OuncesDark: Story = {
  args: { grams: '8.8', units: 'us' },
  globals: dark,
};

export const LongName: Story = {
  args: { name: 'Pork shoulder, boneless, trimmed of most of the fat' },
};
/** From an AI draft: grams are an estimate (OCT-160 §9). */
export const Estimate: Story = { args: { estimate: true } };
export const EstimateDark: Story = { args: { estimate: true }, globals: dark };
/** The AI couldn't estimate it: 0 g, warning background and the reason. */
export const Unsure: Story = {
  args: {
    name: 'Salt',
    kcal: 0,
    grams: '0',
    estimate: true,
    unsure: '“Salt” — couldn’t estimate, enter it or keep 0 g',
  },
};
export const UnsureDark: Story = { ...Unsure, globals: dark };
/** Found by barcode in the manual sheet: the share it was picked in (OCT-435 2.3). */
export const Barcode: Story = {
  args: {
    name: 'Sugar cookies',
    kcal: 880,
    grams: '200',
    barcode: true,
    share: '½ pack · 200 g',
  },
};
export const BarcodeDark: Story = { ...Barcode, globals: dark };
/** Grams edited by hand: the share caption is gone, the badge stays. */
export const BarcodeEdited: Story = {
  args: { ...Barcode.args, grams: '180', kcal: 792, share: undefined },
};

/** Weight read from a scale on a photo of the ingredients (OCT-435 3.2). */
export const FromScale: Story = {
  args: { name: 'Wheat flour', kcal: 1710, grams: '512', from: 'scale' },
};
export const FromScaleDark: Story = { ...FromScale, globals: dark };
export const FromPackage: Story = {
  args: { name: 'Butter 82.5%', kcal: 1346, grams: '180', from: 'package' },
};
/** Gross → edible line under the kcal (OCT-435 3.2, AC-B7). */
export const Edible: Story = {
  args: {
    name: 'Carrots',
    kcal: 126,
    grams: '360',
    estimate: true,
    note: '400 g with peel → edible 360 g · 90% · USDA',
  },
};
export const EdibleDark: Story = { ...Edible, globals: dark };
