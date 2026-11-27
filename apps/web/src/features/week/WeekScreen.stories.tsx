import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { addDays, type DayTotals, type Macros } from '@oct/shared';
import { fn } from 'storybook/test';
import { useT } from '../../i18n';
import { NavBar } from '../../ui/NavBar/NavBar';
import { RUNNING } from '../streaks/fixtures';
import { StreakRow } from '../streaks/StreakRow';
import { WeekHead, WeekView } from './WeekScreen';

const NORM: Macros = { kcal: 2100, proteinG: 120, fatG: 70, carbsG: 240 };
const TODAY = '2026-11-12';

const period = (from: string, kcals: number[]): DayTotals[] =>
  kcals.map((kcal, i) => ({
    date: addDays(from, i),
    kcal,
    proteinG: kcal * 0.045,
    fatG: kcal * 0.034,
    carbsG: kcal * 0.11,
    meals: kcal ? 3 : 0,
  }));

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
const BIG = period('2026-11-09', [1850, 6000, 1960, 1240, 0, 0, 0]);
/** Under the norm early in the week: the per-day average is capped at the norm (OCT-167). */
const SHORTFALL = period('2026-11-09', [1200, 1400, 1100, 0, 0, 0, 0]);
const EMPTY = period('2026-11-09', Array<number>(7).fill(0));

/** The app screen around the view: large «Week» navbar with the desktop head, the wide column. */
function InScreen({
  aside,
  children,
}: {
  aside: ReactNode;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="screen screen--wide">
      <NavBar large title={t('nav.week')} aside={aside} />
      <main className="screen__body">{children}</main>
    </div>
  );
}

const meta = {
  title: 'Week/WeekScreen',
  component: WeekView,
  decorators: [
    (Story, { args }) => (
      <InScreen aside={<WeekHead {...args} />}>{Story()}</InScreen>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    mode: 'week',
    date: '2026-11-09',
    today: TODAY,
    days: THIS_WEEK,
    norm: NORM,
    onPeriod: fn(),
    onMode: fn(),
    onOpenDay: fn(),
    onSetNorm: fn(),
  },
} satisfies Meta<typeof WeekView>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

/** 7.1 */
export const ThisWeek: Story = {};
export const ThisWeekDark: Story = { globals: dark };
/** 7.2: «›» active, total instead of «left», no per-day line. */
export const LastWeekOver: Story = {
  args: { date: '2026-11-02', days: LAST_WEEK },
};
export const LastWeekOverDark: Story = { ...LastWeekOver, globals: dark };
/** 7.3 */
export const Month: Story = {
  args: { mode: 'month', date: '2026-11-01', days: MONTH },
};
export const MonthDark: Story = { ...Month, globals: dark };
/** 7.4 */
export const VeryBigDay: Story = { args: { days: BIG } };
export const VeryBigDayDark: Story = { ...VeryBigDay, globals: dark };
/** 7.5 */
export const NoNorm: Story = { args: { norm: null } };
export const NoNormDark: Story = { ...NoNorm, globals: dark };
/** 7.6: full budget, no averages card. */
export const NoEntries: Story = { args: { days: EMPTY } };
export const NoEntriesDark: Story = { ...NoEntries, globals: dark };
export const Shortfall: Story = { args: { days: SHORTFALL } };
export const ShortfallDark: Story = { ...Shortfall, globals: dark };
export const ShortfallRussian: Story = {
  ...Shortfall,
  globals: { locale: 'ru' },
};
/** 7.8: skeletons after 300 ms. */
export const Loading: Story = { args: { days: undefined } };
export const LoadingDark: Story = { ...Loading, globals: dark };
export const Russian: Story = { globals: { locale: 'ru' } };
export const MonthRussian: Story = { ...Month, globals: { locale: 'ru' } };
/** D.3: segment and pager right of the title, wide chart, cards in two columns. */
export const Desktop: Story = { globals: desktop };
export const DesktopDark: Story = { globals: { ...desktop, ...dark } };
export const DesktopMonth: Story = { ...Month, globals: desktop };
export const DesktopMonthRussian: Story = {
  ...Month,
  globals: { ...desktop, locale: 'ru' },
};
export const DesktopLoading: Story = { ...Loading, globals: desktop };
export const DesktopLoadingDark: Story = {
  ...Loading,
  globals: { ...desktop, ...dark },
};
/** OCT-184 1.1: the streak row above the head. */
const streak = { streak: <StreakRow streak={RUNNING} onOpen={fn()} /> };
export const WithStreak: Story = { args: streak };
export const WithStreakDark: Story = { args: streak, globals: dark };
export const DesktopWithStreak: Story = { args: streak, globals: desktop };
export const DesktopWithStreakDark: Story = {
  args: streak,
  globals: { ...desktop, ...dark },
};
