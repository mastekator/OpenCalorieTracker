import type { Meta, StoryObj } from '@storybook/react-vite';
import { PAST_MONTHS, TODAY } from './fixtures';
import { PastMonths } from './PastMonths';

const meta = {
  title: 'Week/Streaks/PastMonths',
  component: PastMonths,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 'var(--content-max-width)' }}>{Story()}</div>
    ),
  ],
  args: { months: PAST_MONTHS, month: '2026-11', today: TODAY },
} satisfies Meta<typeof PastMonths>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** 2.1: the last three closed months, «All months» opens the rest. */
export const Months: Story = {};
export const MonthsDark: Story = { globals: dark };
export const MonthsRussian: Story = { globals: { locale: 'ru' } };
/** Three or fewer: no «All months». */
export const Few: Story = { args: { months: PAST_MONTHS.slice(0, 3) } };
export const FewDark: Story = { ...Few, globals: dark };
