import type { Meta, StoryObj } from '@storybook/react-vite';
import { ALL_DONE, CHALLENGES, NEWBIE_CHALLENGES, TODAY } from './fixtures';
import { ChallengeList } from './ChallengeList';

const meta = {
  title: 'Week/Streaks/ChallengeList',
  component: ChallengeList,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 'var(--content-max-width)' }}>{Story()}</div>
    ),
  ],
  args: { challenges: CHALLENGES, month: '2026-11', today: TODAY },
} satisfies Meta<typeof ChallengeList>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** 2.1: two in progress, one done. */
export const Running: Story = {};
export const RunningDark: Story = { globals: dark };
export const RunningRussian: Story = { globals: { locale: 'ru' } };
/** 3.1: the profile row opens Profile. */
export const Newbie: Story = { args: { challenges: NEWBIE_CHALLENGES } };
export const NewbieDark: Story = { ...Newbie, globals: dark };
export const NewbieRussian: Story = { ...Newbie, globals: { locale: 'ru' } };
/** All three done. */
export const AllDone: Story = { args: { challenges: ALL_DONE } };
export const AllDoneDark: Story = { ...AllDone, globals: dark };
