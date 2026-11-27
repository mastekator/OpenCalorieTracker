import type { Meta, StoryObj } from '@storybook/react-vite';
import { ROW } from './fixtures';
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
    drinks: ROW,
    hint: false,
    onLog: () => {},
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
export const Russian: Story = {
  args: {
    drinks: ROW.map((d, i) => ({
      ...d,
      name: [
        'Вода',
        'Кофе с молоком',
        'Чай',
        'Кофе',
        'Сок',
        'Молоко',
        'Газировка',
        'Кефир',
      ][i]!,
    })),
  },
  globals: { locale: 'ru' },
};
