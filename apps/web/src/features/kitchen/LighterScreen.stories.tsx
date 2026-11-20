import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { Recipe, RecipeInput } from '@oct/shared';
import { LighterView } from './LighterScreen';
import { PILAF, SALAD } from './fixtures';
import { PILAF_LIGHTER } from './lighterFixtures';

const meta = {
  title: 'Screens/Kitchen/LighterScreen',
  component: LighterView,
  parameters: { layout: 'fullscreen' },
  args: {
    recipe: PILAF,
    online: true,
    load: async () => PILAF_LIGHTER,
    onSave: fn(
      async (
        input: RecipeInput,
        base?: Pick<Recipe, 'id'>,
      ): Promise<Recipe> => ({
        ...PILAF,
        ...input,
        id: base?.id ?? 99,
      }),
    ),
    onSaved: fn(),
  },
} satisfies Meta<typeof LighterView>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };
const never = () => new Promise<never>(() => {});
const fail = async () => {
  throw new Error('timeout');
};

/** 7.3: options with was → now, the saving per serving and the changes. */
export const Variants: Story = {};
export const VariantsDark: Story = { globals: dark };
export const VariantsRussian: Story = { globals: { locale: 'ru' } };
export const Desktop: Story = { globals: desktop };
export const DesktopDark: Story = { globals: { ...desktop, ...dark } };
/** No servings: per 100 g. */
export const NoServings: Story = {
  args: {
    recipe: SALAD,
    load: async () => ({
      variants: [
        {
          ingredients: SALAD.ingredients.slice(0, 3),
          changes: [
            {
              change: 'removed',
              from: 3,
              name: 'Olive oil',
              grams: 20,
              why: 'Lemon juice and oregano keep the taste',
            },
          ],
        },
      ],
    }),
  },
};
/** Waiting for the provider: a status line under the lead. */
export const Loading: Story = { args: { load: never } };
export const LoadingDark: Story = { args: { load: never }, globals: dark };
/** E-10.6: the banner with «Try again». */
export const Failed: Story = { args: { load: fail } };
export const FailedDark: Story = { args: { load: fail }, globals: dark };
/** Offline: the options stay, saving is disabled. */
export const Offline: Story = { args: { online: false } };
