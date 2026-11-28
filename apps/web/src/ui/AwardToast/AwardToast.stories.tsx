import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { AwardKey } from '@oct/shared';
import { AwardToast } from './AwardToast';

/** The «New award» strip (OCT-184 1.2): one award or several. Desktop: shifted right of the sidebar. */
const meta = {
  title: 'UI/AwardToast',
  component: AwardToast,
  args: { awards: ['weeks_4'], onOpen: fn(), onClose: fn() },
} satisfies Meta<typeof AwardToast>;
export default meta;
type Story = StoryObj<typeof meta>;

const SEVERAL = {
  awards: ['weeks_4', 'days_30', 'streak_2', 'photo_1'] satisfies AwardKey[],
};
const desktop = { viewport: { value: 'desktop' } };

export const One: Story = { globals: { theme: 'light' } };
export const OneDark: Story = { globals: { theme: 'dark' } };
export const Several: Story = { args: SEVERAL, globals: { theme: 'light' } };
export const SeveralDark: Story = { args: SEVERAL, globals: { theme: 'dark' } };
export const Desktop: Story = { globals: { ...desktop, theme: 'light' } };
export const DesktopSeveralDark: Story = {
  args: SEVERAL,
  globals: { ...desktop, theme: 'dark' },
};
