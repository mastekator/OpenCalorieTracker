import type { Meta, StoryObj } from '@storybook/react-vite';
import { addDays, type DayTotals } from '@oct/shared';
import { fn } from 'storybook/test';
import { KcalChart } from './KcalChart';

const day = (date: string, kcal: number): DayTotals => ({
  date,
  kcal,
  proteinG: 0,
  fatG: 0,
  carbsG: 0,
  meals: kcal ? 1 : 0,
});
const period = (from: string, kcals: number[]) =>
  kcals.map((k, i) => day(addDays(from, i), k));

const THIS_WEEK = period('2026-11-09', [1850, 2380, 1960, 1240, 0, 0, 0]);
const LAST_WEEK = period(
  '2026-11-02',
  [2050, 1890, 2600, 2200, 1720, 2900, 2400],
);
const MONTH = period('2026-11-01', [
  1980,
  2150,
  1720,
  2040,
  2210,
  1890,
  2300,
  2050,
  1850,
  2380,
  1960,
  1240,
  ...Array<number>(18).fill(0),
]);

const meta = {
  title: 'Week/KcalChart',
  component: KcalChart,
  args: {
    days: THIS_WEEK,
    norm: 2100,
    today: '2026-11-12',
    mode: 'week',
    onOpenDay: fn(),
  },
  decorators: [
    (Story) => (
      <div
        style={{
          padding: 'var(--space-4)',
          background: 'var(--color-surface)',
        }}
      >
        {Story()}
      </div>
    ),
  ],
} satisfies Meta<typeof KcalChart>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 7.1 */
export const ThisWeek: Story = {};
export const ThisWeekDark: Story = { globals: { theme: 'dark' } };
/** 7.2: every day past, several over. */
export const LastWeekOver: Story = {
  args: { days: LAST_WEEK, today: '2026-11-12' },
};
export const LastWeekOverDark: Story = {
  ...LastWeekOver,
  globals: { theme: 'dark' },
};
/** 7.3: tap a bar for the value, tap again to open the day. */
export const Month: Story = { args: { days: MONTH, mode: 'month' } };
export const MonthDark: Story = { ...Month, globals: { theme: 'dark' } };
/** 7.3 after a tap: the tip and the focus-ring frame on its bar; Esc or a tap outside closes it. */
export const MonthTip: Story = {
  ...Month,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Nov 10/ }));
  },
};
export const MonthTipDark: Story = { ...MonthTip, globals: { theme: 'dark' } };
/** OCT-168 at 390 px: touch anywhere on the plot, gaps included; the 29th and 30th are future. */
export const Month390: Story = {
  args: {
    days: period('2026-11-01', [
      ...MONTH.slice(0, 12).map((d) => d.kcal),
      ...MONTH.slice(0, 12)
        .map((d) => d.kcal)
        .reverse(),
      2400,
      0,
      1700,
      2050,
      0,
      0,
    ]),
    mode: 'month',
    today: '2026-11-28',
  },
  globals: { viewport: { value: 'iphone390' } },
};
export const Month390Dark: Story = {
  ...Month390,
  globals: { ...Month390.globals, theme: 'dark' },
};
/** 7.4: 6,000 kcal against 2,000 — the axis stops at 4,000, the bar is clipped. */
export const VeryBigDay: Story = {
  args: {
    days: period('2026-11-09', [1850, 6000, 1960, 1240, 0, 0, 0]),
    norm: 2000,
  },
};
export const VeryBigDayDark: Story = {
  ...VeryBigDay,
  globals: { theme: 'dark' },
};
/** 7.5 */
export const NoNorm: Story = { args: { norm: null } };
export const NoNormDark: Story = { ...NoNorm, globals: { theme: 'dark' } };
/** 7.6 */
export const NoEntries: Story = {
  args: { days: period('2026-11-09', [0, 0, 0, 0, 0, 0, 0]) },
};
export const NoEntriesDark: Story = {
  ...NoEntries,
  globals: { theme: 'dark' },
};
/** D.3: `--chart-height-wide` from 1024 px. */
export const Desktop: Story = {
  globals: { viewport: { value: 'desktop' } },
};
export const Russian: Story = { globals: { locale: 'ru' } };
