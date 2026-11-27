import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { COUNTED, NEWBIE, RESTART, RUNNING } from './fixtures';
import { StreakRow } from './StreakRow';

const meta = {
  title: 'Week/Streaks/StreakRow',
  component: StreakRow,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 'var(--content-max-width)' }}>{Story()}</div>
    ),
  ],
  args: { streak: RUNNING, onOpen: fn() },
} satisfies Meta<typeof StreakRow>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** 1.1 */
export const Running: Story = {};
export const RunningDark: Story = { globals: dark };
export const RunningRussian: Story = { globals: { locale: 'ru' } };
export const Counted: Story = { args: { streak: COUNTED } };
export const NewStreak: Story = { args: { streak: RESTART } };
export const NewStreakDark: Story = { ...NewStreak, globals: dark };
export const Newbie: Story = { args: { streak: NEWBIE } };
export const NewbieDark: Story = { ...Newbie, globals: dark };
