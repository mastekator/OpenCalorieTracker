import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, waitFor } from 'storybook/test';
import { useRow } from './fixtures';
import { WaterCard } from './WaterCard';

const meta = {
  title: 'Screens/Water/WaterCard',
  component: WaterCard,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 'var(--content-max-width)' }}>{Story()}</div>
    ),
  ],
  args: {
    // A fixed past day: the goal sparks play once in a story, not every load.
    today: '2026-11-14',
    ml: 750,
    goalMl: 2000,
    units: 'metric',
    drinks: [],
    hint: false,
    onLog: () => {},
    onOther: () => {},
    onHide: () => {},
    onEdit: () => {},
    onAdd: () => {},
    onOpenDay: () => {},
  },
  // Names follow the story locale; `drinks` adds own ones after the built-ins.
  render: function Render(args) {
    return <WaterCard {...args} drinks={[...useRow(), ...args.drinks]} />;
  },
} satisfies Meta<typeof WaterCard>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** 1.1 */
export const Partial: Story = {};
export const PartialDark: Story = { globals: dark };
/** 1.4 */
export const GoalReached: Story = { args: { ml: 2000 } };
export const GoalReachedDark: Story = { ...GoalReached, globals: dark };
/** E-3.2: past the goal the glass stays full. */
export const OverGoal: Story = { args: { ml: 2600 } };
/** 1.6 */
export const Empty: Story = { args: { ml: 0, hint: true } };
export const EmptyDark: Story = { ...Empty, globals: dark };
export const FluidOunces: Story = { args: { units: 'us' } };
export const Russian: Story = { globals: { locale: 'ru' } };

/** 1.2: held «Coffee with milk» — the amount menu with kcal, «Hide from the row». */
const menuOf = (at: number) => ({
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const tile = await waitFor(() => {
      const el = canvasElement.querySelectorAll('.drink-tile')[at];
      if (!el) throw new Error('no tiles yet');
      return el;
    });
    fireEvent.contextMenu(tile);
  },
});
const menu = menuOf(1);
export const Menu: Story = menu;
export const MenuDark: Story = { ...menu, globals: dark };
export const MenuRussian: Story = { ...menu, globals: { locale: 'ru' } };

/** 1.2: an own drink — «Edit drink» under the line instead of «Hide from the row». */
const own = {
  args: {
    drinks: [
      {
        key: 'custom:1',
        name: 'Oat latte',
        illustration: 'coffee' as const,
        countsWater: true,
        per100: { kcal: 48, proteinG: 1.5, fatG: 2, carbsG: 6 },
      },
    ],
  },
  ...menuOf(8),
};
export const MenuOwn: Story = own;
export const MenuOwnDark: Story = { ...own, globals: dark };
