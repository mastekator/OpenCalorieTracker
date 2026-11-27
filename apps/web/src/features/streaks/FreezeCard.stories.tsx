import type { Meta, StoryObj } from '@storybook/react-vite';
import { FROZEN, NEWBIE, RUNNING } from './fixtures';
import { FreezeCard } from './FreezeCard';

const meta = {
  title: 'Week/Streaks/FreezeCard',
  component: FreezeCard,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 'var(--content-max-width)' }}>{Story()}</div>
    ),
  ],
  args: { streak: RUNNING },
} satisfies Meta<typeof FreezeCard>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** 2.1: one of two, two weeks to the next. */
export const One: Story = {};
export const OneDark: Story = { globals: dark };
export const OneRussian: Story = { globals: { locale: 'ru' } };
/** 3.3: the freeze was spent. */
export const None: Story = { args: { streak: FROZEN } };
export const NoneDark: Story = { ...None, globals: dark };
/** At the cap: no more are kept. */
export const Full: Story = {
  args: { streak: { ...RUNNING, freezes: 2, weeksToFreeze: null } },
};
export const FullDark: Story = { ...Full, globals: dark };
/** 3.1: the first one is a gift. */
export const Newbie: Story = { args: { streak: NEWBIE } };
export const NewbieRussian: Story = { ...Newbie, globals: { locale: 'ru' } };
