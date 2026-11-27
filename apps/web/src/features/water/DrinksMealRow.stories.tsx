import { userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { List } from '../../ui/List/List';
import { DrinksMealRow } from './DrinksMealRow';
import { DRINKS } from './fixtures';

const meta = {
  title: 'Screens/Water/DrinksMealRow',
  component: DrinksMealRow,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 'var(--content-max-width)' }}>
        <List title="Meals">{Story()}</List>
      </div>
    ),
  ],
  args: { entries: DRINKS, units: 'metric' },
} satisfies Meta<typeof DrinksMealRow>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const open = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) =>
    userEvent.click(
      await within(canvasElement).findByRole('button', {
        name: /^(Drinks|Напитки)/,
      }),
    ),
};

export const Closed: Story = {};
export const ClosedDark: Story = { globals: dark };
export const Open: Story = { ...open };
export const OpenDark: Story = { ...open, globals: dark };
export const FluidOunces: Story = { ...open, args: { units: 'us' } };
