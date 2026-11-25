import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, fn, within } from 'storybook/test';
import { RecipeEditor } from './RecipeEditor';
import { CHEESECAKE, MEALS, PILAF, SALAD } from './fixtures';
import { recipeFromMeal } from './recipeFromMeal';

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
/** Weights in ounces (AC-2.6); saved in grams. */
export const Ounces: Story = { args: { recipe: PILAF, units: 'us' } };
export const OuncesDark: Story = {
  args: { recipe: PILAF, units: 'us' },
  globals: dark,
};
export const OuncesDesktop: Story = {
  args: { recipe: SALAD, units: 'us' },
  globals: desktop,
};

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

/** 4.4: 50 ingredients — the line instead of «+ Ingredient», no button (AC-C2). */
const full: Story = {
  args: {
    recipe: {
      ...SALAD,
      ingredients: Array.from({ length: 50 }, (_, i) => ({
        ...SALAD.ingredients[i % SALAD.ingredients.length]!,
      })),
    },
  },
};
export const Full: Story = full;
export const FullDark: Story = { ...full, globals: dark };
/** 2.5: «+ Ingredient» opens the search sheet. */
export const AddIngredient: Story = {
  args: { recipe: SALAD },
  play: async ({ canvas, canvasElement }) => {
    fireEvent.click(await canvas.findByRole('button', { name: 'Ingredient' }));
    await within(canvasElement.ownerDocument.body).findByRole('dialog');
  },
};
/** 2.4: steps with a photo, «+ Step»; the handle drags, a tap on it opens «Move up / Move down / Delete». */
export const Steps: Story = {
  args: { recipe: PILAF },
  play: async ({ canvas }) => {
    (await canvas.findByRole('button', { name: 'Step' })).scrollIntoView();
  },
};
export const StepsDark: Story = { ...Steps, globals: dark };
/** The step menu of the last step: «Move down» is disabled. */
export const StepMenu: Story = {
  args: { recipe: PILAF },
  play: async ({ canvas, canvasElement }) => {
    fireEvent.click(await canvas.findByRole('button', { name: 'Move step 3' }));
    await within(canvasElement.ownerDocument.body).findByRole('dialog');
  },
};
export const StepMenuDark: Story = { ...StepMenu, globals: dark };
/** §10: two columns. */
export const Desktop: Story = { args: { recipe: PILAF }, globals: desktop };
export const DesktopDark: Story = {
  args: { recipe: PILAF },
  globals: { ...desktop, ...dark },
};
/** 7.2: a draft from «Recipe from text» — the AI notice, «estimate» badges, salt «to taste» at 0 g marked. */
const AI_DRAFT = {
  ...PILAF,
  ingredients: [
    ...PILAF.ingredients.map((i) => ({ ...i, source: 'ai' as const })),
    {
      name: 'Salt',
      grams: 0,
      kcal: 0,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
      source: 'ai' as const,
    },
  ],
};
const aiArgs = {
  draft: AI_DRAFT,
  ai: { unsure: [PILAF.ingredients.length] },
};
export const AiDraft: Story = { args: aiArgs };
export const AiDraftDark: Story = { args: aiArgs, globals: dark };
export const AiDraftDesktop: Story = { args: aiArgs, globals: desktop };
/** 3.7: a draft from a meal — the notice says which meal; the name is the dish with the most kcal. */
const fromMealArgs = recipeFromMeal(MEALS[0]!);
export const FromMeal: Story = { args: fromMealArgs };
export const FromMealDark: Story = { args: fromMealArgs, globals: dark };
export const FromMealRussian: Story = {
  args: fromMealArgs,
  globals: { locale: 'ru' },
};
export const FromMealDesktop: Story = { args: fromMealArgs, globals: desktop };
export const FromMealDesktopDark: Story = {
  args: fromMealArgs,
  globals: { ...desktop, ...dark },
};

const ofField = async (
  canvas: {
    findByRole: (r: string, o: { name: RegExp }) => Promise<HTMLElement>;
  },
  name: RegExp,
  value: string,
) =>
  fireEvent.change(await canvas.findByRole('textbox', { name }), {
    target: { value },
  });

/** OCT-352 1.2: a recipe without ingredients, calories per 100 g and a serving preview. */
export const Per100: Story = { args: { recipe: CHEESECAKE } };
export const Per100Dark: Story = {
  args: { recipe: CHEESECAKE },
  globals: dark,
};
export const Per100Russian: Story = {
  args: { recipe: CHEESECAKE },
  globals: { locale: 'ru' },
};
export const Per100Desktop: Story = {
  args: { recipe: CHEESECAKE },
  globals: desktop,
};
/** 1.4: field errors (E-1.a) — kcal over 900, macros over 100 g. */
export const Per100Errors: Story = {
  args: { recipe: CHEESECAKE },
  play: async ({ canvas }) => {
    await ofField(canvas, /^Calories per 100.g/, '1200');
    await ofField(canvas, /^Protein/, '60');
    await ofField(canvas, /^Fat/, '40');
    await ofField(canvas, /^Carbs/, '30');
  },
};
export const Per100ErrorsDark: Story = { ...Per100Errors, globals: dark };
/** 1.5: by ingredients → per 100 g asks first. */
export const SwitchConfirm: Story = {
  args: { recipe: PILAF },
  play: async ({ canvas, canvasElement }) => {
    fireEvent.click(
      await canvas.findByRole('radio', { name: /Calories per 100.g/ }),
    );
    await within(canvasElement.ownerDocument.body).findByRole('dialog');
  },
};
export const SwitchConfirmDark: Story = { ...SwitchConfirm, globals: dark };
/** 1.6: per 100 g → by ingredients: an empty list, the old values as a note. */
export const SwitchBack: Story = {
  args: { recipe: CHEESECAKE },
  play: async ({ canvas }) => {
    fireEvent.click(
      await canvas.findByRole('radio', { name: 'By ingredients' }),
    );
  },
};
export const SwitchBackDark: Story = { ...SwitchBack, globals: dark };
