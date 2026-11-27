import type { Meta, StoryObj } from '@storybook/react-vite';
import { COUNTED, DAYS, NEWBIE, RESTART, RUNNING, TODAY } from './fixtures';
import { StreakCard } from './StreakCard';

const meta = {
  title: 'Week/Streaks/StreakCard',
  component: StreakCard,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 'var(--content-max-width)' }}>{Story()}</div>
    ),
  ],
  args: { streak: RUNNING, days: DAYS, today: TODAY },
} satisfies Meta<typeof StreakCard>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** 2.1: streak, this week, trail with a frozen and a short week. */
export const Running: Story = {};
export const RunningDark: Story = { globals: dark };
export const RunningRussian: Story = { globals: { locale: 'ru' } };
/** This week has already counted. */
export const Counted: Story = { args: { streak: COUNTED } };
export const CountedDark: Story = { ...Counted, globals: dark };
/** 3.2 */
export const NewStreak: Story = { args: { streak: RESTART } };
export const NewStreakDark: Story = { ...NewStreak, globals: dark };
/** 3.1: nothing is «zero»: no best streak, no trail. */
export const Newbie: Story = { args: { streak: NEWBIE, days: [] } };
export const NewbieDark: Story = { ...Newbie, globals: dark };
export const NewbieRussian: Story = { ...Newbie, globals: { locale: 'ru' } };
