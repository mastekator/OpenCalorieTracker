import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, within } from 'storybook/test';
import { KitchenView } from './KitchenScreen';
import { CHEESECAKE, MEALS, RECIPES } from './fixtures';

const meta = {
  title: 'Screens/Kitchen/KitchenScreen',
  component: KitchenView,
  parameters: { layout: 'fullscreen' },
  args: { recipes: RECIPES, meals: MEALS },
} satisfies Meta<typeof KitchenView>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

/** 1.2: photo or illustration, kcal per 100 g and per serving, recently logged first. */
export const List: Story = {};
export const ListDark: Story = { globals: dark };
export const ListRussian: Story = { globals: { locale: 'ru' } };
export const ListDesktop: Story = { globals: desktop };
/** «+» without AI: «Enter manually» only. */
export const Add: Story = {
  play: async ({ canvasElement }) => {
    fireEvent.click(
      await within(canvasElement).findByRole('button', {
        name: /Add a recipe|Добавить рецепт/,
      }),
    );
  },
};
export const AddDark: Story = { ...Add, globals: dark };
/** «+» with AI set up: also «Recipe from text» with the AI sparkle. */
export const AddWithAi: Story = { ...Add, args: { ai: true } };
export const AddWithAiDark: Story = {
  ...Add,
  args: { ai: true },
  globals: dark,
};
/** 1.4: «New recipe» opens the editor. */
export const Empty: Story = { args: { recipes: [] } };
export const EmptyDark: Story = { args: { recipes: [] }, globals: dark };
/** OCT-433: with AI set up the empty list also offers «Recipe from text». */
export const EmptyWithAi: Story = { args: { recipes: [], ai: true } };
export const EmptyWithAiDark: Story = {
  args: { recipes: [], ai: true },
  globals: dark,
};
/** 1.5 → 3.7: «From a meal» — the last meals with dishes; a tap opens the editor. */
const pickMeal: Story = {
  play: async ({ canvasElement }) => {
    fireEvent.click(
      await within(canvasElement).findByRole('button', {
        name: /Add a recipe|Добавить рецепт/,
      }),
    );
    fireEvent.click(
      await within(document.body).findByText(/From a meal|Из приёма пищи/),
    );
  },
};
export const PickMeal: Story = pickMeal;
export const PickMealDark: Story = { ...pickMeal, globals: dark };
export const PickMealDesktop: Story = { ...pickMeal, globals: desktop };

/** OCT-352 2.2: a recipe without ingredients is marked «no ingredients». */
export const WithoutIngredients: Story = {
  args: { recipes: [CHEESECAKE, ...RECIPES] },
};
export const WithoutIngredientsDark: Story = {
  args: { recipes: [CHEESECAKE, ...RECIPES] },
  globals: dark,
};
