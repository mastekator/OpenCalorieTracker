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
    onOpenDay: () => {},
  },
  // Names follow the story locale.
  render: function Render(args) {
    return <WaterCard {...args} drinks={useRow()} />;
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
const menu = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const tile = await waitFor(() => {
      const el = canvasElement.querySelectorAll('.drink-tile')[1];
      if (!el) throw new Error('no tiles yet');
      return el;
    });
    fireEvent.contextMenu(tile);
  },
};
export const Menu: Story = menu;
export const MenuDark: Story = { ...menu, globals: dark };
export const MenuRussian: Story = { ...menu, globals: { locale: 'ru' } };
