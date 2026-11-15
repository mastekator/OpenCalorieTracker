import type { Meta, StoryObj } from '@storybook/react-vite';
import { addDays, daysBetween, summarize, type DayTotals } from '@oct/shared';
import { MacroAveragesCard } from './MacroAveragesCard';
import { WeekBudgetCard } from './WeekBudgetCard';

const NORM = { kcal: 2100, proteinG: 120, fatG: 70, carbsG: 240 };
const TODAY = '2026-11-12';
const week = (from: string, kcals: number[]): DayTotals[] =>
  kcals.map((kcal, i) => ({
    date: addDays(from, i),
    kcal,
    proteinG: kcal * 0.045,
    fatG: kcal * 0.034,
    carbsG: kcal * 0.11,
    meals: kcal ? 3 : 0,
  }));
const THIS_WEEK = week('2026-11-09', [1850, 2380, 1960, 1240, 0, 0, 0]);
const LAST_WEEK = week(
  '2026-11-02',
  [2050, 1890, 2600, 2200, 1720, 2900, 2400],
);
const OVER = week('2026-11-09', [4000, 4000, 4000, 3000, 0, 0, 0]);
const MONTH = week('2026-11-01', [
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

/** Both cards of one period, as on the screen. */
function Cards({
  mode,
  days,
  norm,
}: {
  mode: 'week' | 'month';
  days: DayTotals[];
  norm: boolean;
}) {
  const n = norm ? NORM : null;
  const summary = summarize(days, n, TODAY);
  const last = days.at(-1)!.date;
  const daysLeft =
    TODAY >= days[0]!.date && TODAY <= last ? daysBetween(TODAY, last) + 1 : 0;
  return (
    <div
      style={{
        display: 'grid',
        gap: 'var(--space-4)',
        maxWidth: 'var(--dialog-max-width)',
      }}
    >
      <WeekBudgetCard
        mode={mode}
        summary={summary}
        norm={n && n.kcal}
        days={days.length}
        daysLeft={daysLeft}
      />
      {summary.average && (
        <MacroAveragesCard
          average={summary.average}
          daysWithMeals={summary.daysWithMeals}
          norm={n}
        />
      )}
    </div>
  );
}

const meta = {
  title: 'Week/WeekCards',
  component: Cards,
  args: { mode: 'week', days: THIS_WEEK, norm: true },
  decorators: [
    (Story) => (
      <div
        style={{
          padding: 'var(--space-4)',
          background: 'var(--color-bg)',
        }}
      >
        {Story()}
      </div>
    ),
  ],
} satisfies Meta<typeof Cards>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** Current week: left, bar, per remaining day. */
export const CurrentWeek: Story = {};
export const CurrentWeekDark: Story = { globals: dark };
/** Past week (AC-3.10): total, no per-day line. */
export const LastWeek: Story = { args: { days: LAST_WEEK } };
export const LastWeekDark: Story = { ...LastWeek, globals: dark };
/** Over for the week (E-3.6): warning, no per-day line. */
export const Over: Story = { args: { days: OVER } };
export const OverDark: Story = { ...Over, globals: dark };
export const Month: Story = { args: { mode: 'month', days: MONTH } };
export const MonthDark: Story = { ...Month, globals: dark };
/** 7.5: eaten only, grams without bars. */
export const NoNorm: Story = { args: { norm: false } };
export const NoNormDark: Story = { ...NoNorm, globals: dark };
export const Russian: Story = { globals: { locale: 'ru' } };
