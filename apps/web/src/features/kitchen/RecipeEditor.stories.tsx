import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, fn, within } from 'storybook/test';
import { RecipeEditor } from './RecipeEditor';
import { PILAF, SALAD } from './fixtures';

const meta = {
  title: 'Screens/Kitchen/RecipeEditor',
  component: RecipeEditor,
  parameters: { layout: 'fullscreen' },
  args: {
    online: true,
    search: async () => [],
    onSave: fn(async () => PILAF),
    onSaved: fn(),
  },
} satisfies Meta<typeof RecipeEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

/** 2.3, new: empty name, no ingredients, totals «—». */
export const New: Story = {};
export const NewDark: Story = { globals: dark };
/** «Save» with nothing filled: the name and «Add at least one ingredient» are marked. */
export const NewErrors: Story = {
  play: async ({ canvas }) => {
    fireEvent.click(await canvas.findByRole('button', { name: 'Save' }));
  },
};
/** 2.3, 2.4, edit: totals per serving / 100 g / whole, cooked weight and servings. */
export const Edit: Story = { args: { recipe: PILAF } };
export const EditDark: Story = { args: { recipe: PILAF }, globals: dark };
export const EditRussian: Story = {
  args: { recipe: PILAF },
  globals: { locale: 'ru' },
};
/** 2.4: no cooked weight — «Weigh the cooked dish…» with the raw weight; no servings — «—». */
export const NoCookedWeight: Story = { args: { recipe: SALAD } };
export const NoCookedWeightDark: Story = {
  args: { recipe: SALAD },
  globals: dark,
};
/** 2.6, E-10.2: cooked 3+ times the raw weight — a warning, «Save» still works. */
export const WeightWarning: Story = {
  args: { recipe: { ...SALAD, cookedG: 1860, servings: 2 } },
};
export const WeightWarningDark: Story = {
  ...WeightWarning,
  globals: dark,
};
/** E-10.5: offline «Save» is disabled; the app's offline bar says why. */
export const Offline: Story = { args: { recipe: PILAF, online: false } };
/** 2.5: «+ Ingredient» opens the search sheet. */
export const AddIngredient: Story = {
  args: { recipe: SALAD },
  play: async ({ canvas, canvasElement }) => {
    fireEvent.click(await canvas.findByRole('button', { name: 'Ingredient' }));
    await within(canvasElement.ownerDocument.body).findByRole('dialog');
  },
};
/** §10: two columns. */
export const Desktop: Story = { args: { recipe: PILAF }, globals: desktop };
export const DesktopDark: Story = {
  args: { recipe: PILAF },
  globals: { ...desktop, ...dark },
};
