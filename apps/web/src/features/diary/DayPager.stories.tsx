import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { DayPager } from './DayPager';

const TODAY = '2026-11-14';

// Arrows and the picker move the day inside the story.
function Demo({
  date,
  mode,
}: {
  date: string;
  mode?: 'day' | 'week' | 'month';
}) {
  const [day, setDay] = useState(date);
  return <DayPager mode={mode} date={day} today={TODAY} onChange={setDay} />;
}

const meta = {
  title: 'Diary/DayPager',
  component: Demo,
  args: { date: '2026-11-12' },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 6.1: a day in the past. */
export const PastDay: Story = {};
/** 6.2: «›» disabled. */
export const Today: Story = { args: { date: TODAY } };
export const Yesterday: Story = { args: { date: '2026-11-13' } };
/** Another year: the year on a second line. */
export const LastYear: Story = { args: { date: '2025-12-30' } };
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};
export const Hover: Story = { parameters: { pseudo: { hover: true } } };
export const Dark: Story = { globals: { theme: 'dark' } };
export const TodayDark: Story = {
  args: { date: TODAY },
  globals: { theme: 'dark' },
};
export const Russian: Story = { globals: { locale: 'ru' } };
export const Narrow: Story = { globals: { viewport: { value: 'iphoneSE' } } };
/** OCT-19 §4: «This week» over the range, «›» disabled. */
export const ThisWeek: Story = { args: { mode: 'week', date: TODAY } };
export const LastWeek: Story = { args: { mode: 'week', date: '2026-11-05' } };
/** Older weeks: the range alone. */
export const OlderWeek: Story = { args: { mode: 'week', date: '2026-10-28' } };
export const ThisMonth: Story = { args: { mode: 'month', date: TODAY } };
export const LastMonth: Story = { args: { mode: 'month', date: '2026-10-01' } };
export const WeekDark: Story = {
  args: { mode: 'week', date: '2026-11-05' },
  globals: { theme: 'dark' },
};
export const MonthRussian: Story = {
  args: { mode: 'month', date: TODAY },
  globals: { locale: 'ru' },
};
export const WeekRussian: Story = {
  args: { mode: 'week', date: '2026-10-28' },
  globals: { locale: 'ru' },
};
