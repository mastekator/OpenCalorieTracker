import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, within } from 'storybook/test';
import { KitchenView } from './KitchenScreen';
import { RECIPES } from './fixtures';

const meta = {
  title: 'Screens/Kitchen/KitchenScreen',
  component: KitchenView,
  parameters: { layout: 'fullscreen' },
  args: { recipes: RECIPES },
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
/** «+»: wave 1 offers «Enter manually» only. */
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
/** 1.4: «New recipe» opens the editor. */
export const Empty: Story = { args: { recipes: [] } };
export const EmptyDark: Story = { args: { recipes: [] }, globals: dark };
