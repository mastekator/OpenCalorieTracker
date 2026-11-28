import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActivityMap } from './ActivityMap';
import { SHORT_YEAR, TODAY, YEAR } from './fixtures';

const meta = {
  title: 'Week/Streaks/ActivityMap',
  component: ActivityMap,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 'var(--content-max-width)' }}>{Story()}</div>
    ),
  ],
  args: { days: YEAR, today: TODAY },
} satisfies Meta<typeof ActivityMap>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

/** 2.1: a year from 9 February, scrolled to today, today picked. */
export const Year: Story = {};
export const YearDark: Story = { globals: dark };
export const YearRussian: Story = { globals: { locale: 'ru' } };
/** 3.1: no entries yet — one line. */
export const Empty: Story = { args: { days: [] } };
export const EmptyDark: Story = { ...Empty, globals: dark };
export const EmptyRussian: Story = { ...Empty, globals: { locale: 'ru' } };
/** 3.4: the local copy is shorter than a year. */
export const AsOf: Story = { args: { days: SHORT_YEAR, asOf: '2026-11-12' } };
export const AsOfDark: Story = { ...AsOf, globals: dark };
/** D.1: 14px cells, the whole year. */
export const Desktop: Story = {
  decorators: [(Story) => <div style={{ maxWidth: 960 }}>{Story()}</div>],
  globals: desktop,
};
export const DesktopDark: Story = {
  ...Desktop,
  globals: { ...desktop, ...dark },
};
