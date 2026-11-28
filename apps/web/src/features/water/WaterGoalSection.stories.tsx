import type { Meta, StoryObj } from '@storybook/react-vite';
import { WaterGoalSection } from './WaterGoalSection';

const meta = {
  title: 'Screens/Water/WaterGoalSection',
  component: WaterGoalSection,
  args: {
    goalMl: 2000,
    manual: false,
    online: true,
    units: 'metric',
    onOpen: () => {},
  },
} satisfies Meta<typeof WaterGoalSection>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** 4.1: the EFSA reference by sex, with the disclaimer. */
export const Reference: Story = {};
export const ReferenceDark: Story = { ...Reference, globals: dark };
/** 4.2: set by the user, no disclaimer. */
export const Manual: Story = { args: { goalMl: 2500, manual: true } };
export const ManualDark: Story = { ...Manual, globals: dark };
/** Offline: greyed out, with the reason under the group. */
export const Offline: Story = { args: { online: false } };
export const OfflineDark: Story = { ...Offline, globals: dark };
export const FluidOunces: Story = { args: { units: 'us' } };
export const Russian: Story = { globals: { locale: 'ru' } };
