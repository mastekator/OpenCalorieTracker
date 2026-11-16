import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DayCalendar } from './DayCalendar';

const MARKED = new Set([
  '2026-11-02',
  '2026-11-03',
  '2026-11-05',
  '2026-11-07',
  '2026-11-08',
  '2026-11-09',
  '2026-11-11',
  '2026-11-12',
  '2026-11-14',
  '2026-11-16',
]);

function Demo({ value, min }: { value: string; min?: string }) {
  const [day, setDay] = useState(value);
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <DayCalendar
        value={day}
        today="2026-11-16"
        min={min}
        marked={MARKED}
        onChange={setDay}
      />
      <code style={{ font: 'var(--text-footnote-size) monospace' }}>
        value = {day}
      </code>
    </div>
  );
}

const meta = {
  title: 'UI/DayCalendar',
  component: Demo,
  args: { value: '2026-11-14' },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Today is 16 Nov: later days and «›» are disabled; dots mark weighings. */
export const Default: Story = {};
/** Today selected: filled circle instead of green text. */
export const TodaySelected: Story = { args: { value: '2026-11-16' } };
/** `min` = 10 Nov stands in for the birth date: earlier days and «‹» are disabled. */
export const BirthMonth: Story = {
  args: { value: '2026-11-12', min: '2026-11-10' },
};
export const Dark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
export const RussianDark: Story = {
  globals: { locale: 'ru', theme: 'dark' },
};
