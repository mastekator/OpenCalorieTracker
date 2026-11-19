import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, within } from 'storybook/test';
import { PILAF, SALAD } from '../../features/kitchen/fixtures';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { PortionSheet } from './PortionSheet';

type Props = Omit<ComponentProps<typeof PortionSheet>, 'open' | 'onClose'>;

// Opens on load; the button reopens it so focus return is visible.
function Demo(props: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button variant="tonal" onClick={() => setOpen(true)}>
        {t('recipe.log')}
      </Button>
      {open && <PortionSheet {...props} open onClose={() => setOpen(false)} />}
    </>
  );
}

const meta = {
  title: 'UI/PortionSheet',
  component: Demo,
  args: {
    recipe: PILAF,
    onAdd: fn(),
    // 19:40: dinner by the hour, as in the design.
    now: new Date(2026, 10, 19, 19, 40),
  },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

/** 3.1: «Servings / Grams», ±½ serving, ½ · 1 · 1½ · 2, «Add» to the meal being edited. */
export const WithServings: Story = {};
export const WithServingsDark: Story = { globals: dark };
/** 3.2: in grams, ±10 g. */
export const Grams: Story = {
  // The sheet is a modal <dialog> outside the canvas.
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    (await body.findByRole('radio', { name: /Grams|Граммы/ })).click();
  },
};
/** 3.3: no servings — grams only, 100 g. */
export const Ounces: Story = { args: { units: 'us', log: true } };
export const OuncesDark: Story = {
  args: { units: 'us', log: true },
  globals: dark,
};
export const NoServings: Story = { args: { recipe: SALAD } };
export const NoServingsDark: Story = {
  args: { recipe: SALAD },
  globals: dark,
};
/** From the recipe card and «Done!»: meal and time, «Log to dinner». */
export const WithMeal: Story = { args: { log: true } };
export const WithMealDark: Story = { args: { log: true }, globals: dark };
export const WithMealRussian: Story = {
  args: { log: true },
  globals: { locale: 'ru', viewport: { value: 'iphoneSE' } },
};
export const Desktop: Story = { args: { log: true }, globals: desktop };
export const DesktopDark: Story = {
  args: { log: true },
  globals: { ...desktop, ...dark },
};
