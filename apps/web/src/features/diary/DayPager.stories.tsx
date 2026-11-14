import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { DayPager } from './DayPager';

const TODAY = '2026-11-14';

// Arrows and the picker move the day inside the story.
function Demo({ date }: { date: string }) {
  const [day, setDay] = useState(date);
  return <DayPager date={day} today={TODAY} onChange={setDay} />;
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
