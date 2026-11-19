import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, waitFor, within } from 'storybook/test';
import { RecipeView } from './RecipeScreen';
import { PILAF, SALAD } from './fixtures';

const meta = {
  title: 'Screens/Kitchen/RecipeScreen',
  component: RecipeView,
  parameters: { layout: 'fullscreen' },
  args: {
    recipe: PILAF,
    today: '2026-11-19',
    online: true,
    lighter: true,
    onDelete: fn(async () => {}),
  },
} satisfies Meta<typeof RecipeView>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

/** Without AI: no «Make it lighter» row or menu item. */
export const NoAi: Story = { args: { lighter: false } };
/** 2.1, 2.2: photo, meta, Serving / 100 g / Whole, ingredients (0 g not counted), steps. */
export const WithServings: Story = {};
export const WithServingsDark: Story = { globals: dark };
export const WithServingsRussian: Story = { globals: { locale: 'ru' } };
/** 2.2: scrolled past the page title, the navbar shows the recipe name (before scrolling — 2.1, none). */
export const Scrolled: Story = {
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole('heading', { level: 2, name: 'Homemade pilaf' });
    // Retried: the page may still be growing (the photo) when the play starts.
    await waitFor(() => {
      canvasElement.ownerDocument.defaultView?.scrollTo(0, 600);
      const title = canvasElement.querySelector('.navbar__title');
      if (title?.classList.contains('navbar__title--hidden'))
        throw new Error('title still hidden');
    });
  },
};
export const ScrolledDark: Story = { ...Scrolled, globals: dark };
/** §10: title over three columns. */
export const Desktop: Story = { globals: desktop };
export const DesktopDark: Story = { globals: { ...desktop, ...dark } };
/** No servings: 100 g by default, no Serving option; no photo: the illustration; no steps: no block. */
export const NoServings: Story = { args: { recipe: SALAD } };
export const NoServingsDark: Story = { args: { recipe: SALAD }, globals: dark };
/** 2.7: «⋯» → Delete recipe → the alert (E-10.4). */
export const Delete: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    // The sheet and the alert are modal dialogs outside the canvas.
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'More' }));
    await userEvent.click(
      await body.findByRole('button', { name: 'Delete recipe' }),
    );
    await body.findByRole('alertdialog');
  },
};
export const DeleteDark: Story = { ...Delete, globals: dark };
/** Offline: read-only, delete greyed out; the offline bar above says why (OCT-25). */
export const Offline: Story = {
  args: { online: false },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'More' }));
  },
};
