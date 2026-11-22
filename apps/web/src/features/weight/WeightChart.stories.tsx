import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { addDays, weightTrend, type Weighing } from '@oct/shared';
import { axisStart, periodStart } from './weightScale';
import { WeightChart } from './WeightChart';

const TODAY = '2026-11-16';
const FROM = periodStart(TODAY, 'quarter')!;
const POINTS: Weighing[] = Array.from({ length: 40 }, (_, i) => ({
  date: addDays(FROM, Math.round(i * 2.3)),
  weightKg: Math.round((82 - i * 0.05 + ((i * 7) % 5) * 0.2) * 10) / 10,
}));
/** Four weigh-ins over the last four days, in a «3 months» period. */
const SHORT: Weighing[] = [82.4, 82.1, 82.3, 82.6].map((weightKg, i) => ({
  date: addDays(TODAY, i - 3),
  weightKg,
}));
/** Every other day for three weeks. */
const WEEKS: Weighing[] = POINTS.slice(-10).map((p, i) => ({
  ...p,
  date: addDays(TODAY, (i - 9) * 2),
}));
const start = (points: readonly Weighing[], from: string | null = FROM) =>
  axisStart(points[0]!.date, from, TODAY);
const DAILY: Weighing[] = Array.from({ length: 1200 }, (_, i) => ({
  date: addDays(TODAY, i - 1199),
  weightKg: Math.round((90 - i * 0.008 + ((i * 7) % 9) * 0.15) * 10) / 10,
}));

const meta = {
  title: 'Screens/Weight/WeightChart',
  component: WeightChart,
  decorators: [
    (Story) => (
      <div
        style={{
          maxWidth: 'var(--content-max-width)',
          paddingTop: 'var(--space-12)',
        }}
      >
        {Story()}
      </div>
    ),
  ],
  args: {
    points: POINTS,
    trend: weightTrend(POINTS),
    start: FROM,
    today: TODAY,
    units: 'metric',
    target: 78,
    label: 'Weight chart',
    selected: null,
    onSelect: fn(),
    onEdit: fn(),
  },
} satisfies Meta<typeof WeightChart>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

export const Quarter: Story = {};
export const QuarterDark: Story = { globals: dark };
/** A weighing picked: line, ring, tip. */
export const Picked: Story = { args: { selected: POINTS[20]!.date } };
export const PickedDark: Story = { ...Picked, globals: dark };
/** The goal far below the data: the axis widens to it (AC-9.24). */
export const FarGoal: Story = { args: { target: 65 } };
export const NoGoal: Story = { args: { target: null } };
/** Under three weighings in the history: dots, no trend. */
export const NoTrend: Story = {
  args: {
    points: POINTS.slice(-2),
    trend: null,
    start: start(POINTS.slice(-2)),
  },
};
export const NoTrendDark: Story = { ...NoTrend, globals: dark };
/** One weighing: the narrowest axis, 5 days to today. */
export const One: Story = {
  args: {
    points: POINTS.slice(-1),
    trend: null,
    start: start([POINTS.at(-1)!]),
  },
};
export const OneDark: Story = { ...One, globals: dark };
/** A history of four days in «3 months»: the axis starts at it, a label per day. */
export const ShortHistory: Story = {
  args: { points: SHORT, trend: weightTrend(SHORT), start: start(SHORT) },
};
export const ShortHistoryDark: Story = { ...ShortHistory, globals: dark };
/** Three weeks: a label every week, back from today. */
export const Weeks: Story = {
  args: {
    points: WEEKS,
    trend: weightTrend(WEEKS),
    start: start(WEEKS, periodStart(TODAY, 'month')),
  },
};
export const WeeksDark: Story = { ...Weeks, globals: dark };
/** «Year» over a year of weighings: every 3rd month start, January as the year. */
export const Year: Story = {
  args: {
    points: DAILY.slice(-366),
    trend: weightTrend(DAILY)!.slice(-366),
    start: periodStart(TODAY, 'year')!,
    target: null,
  },
};
export const YearDark: Story = { ...Year, globals: dark };
/** Over 400 weighings: only the trend; Jan 1 of each year under the plot. */
export const ManyOnlyTrend: Story = {
  args: {
    points: DAILY,
    trend: weightTrend(DAILY),
    start: start(DAILY, null),
    target: null,
  },
};
export const ManyOnlyTrendDark: Story = { ...ManyOnlyTrend, globals: dark };
