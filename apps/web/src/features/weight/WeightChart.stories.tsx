import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { addDays, weightTrend, type Weighing } from '@oct/shared';
import { periodStart } from './weightScale';
import { WeightChart } from './WeightChart';

const TODAY = '2026-11-16';
const FROM = periodStart(TODAY, 'quarter')!;
const POINTS: Weighing[] = Array.from({ length: 40 }, (_, i) => ({
  date: addDays(FROM, Math.round(i * 2.3)),
  weightKg: Math.round((82 - i * 0.05 + ((i * 7) % 5) * 0.2) * 10) / 10,
}));
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
    from: FROM,
    today: TODAY,
    units: 'metric',
    target: 78,
    weeks: false,
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
    from: periodStart(TODAY, 'month')!,
    weeks: true,
  },
};
export const One: Story = { args: { points: POINTS.slice(-1), trend: null } };
export const OneDark: Story = { ...One, globals: dark };
/** Over 400 weighings: only the trend; years under the plot past two years. */
export const ManyOnlyTrend: Story = {
  args: {
    points: DAILY,
    trend: weightTrend(DAILY),
    from: DAILY[0]!.date,
    target: null,
  },
};
export const ManyOnlyTrendDark: Story = { ...ManyOnlyTrend, globals: dark };
