import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, fn, within } from 'storybook/test';
import type { Recipe, Units } from '@oct/shared';
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
  (await within(body).findAllByRole('radio'))[1]!.click();

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
