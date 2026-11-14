import type { Meta, StoryObj } from '@storybook/react-vite';
import { SaveBar } from './SaveBar';

const noop = () => {};

const meta = {
  title: 'UI/SaveBar',
  component: SaveBar,
  args: { preview: '1 810 kcal', onSave: noop },
} satisfies Meta<typeof SaveBar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Above the tab bar while there are edits (8.5). */
export const Preview: Story = {};
/** 8.3: partial profile, saved without a goal. */
export const NoGoal: Story = { args: { preview: null } };
/** 8.11: a field has an error. */
export const Disabled: Story = { args: { disabled: true } };
export const Saving: Story = { args: { loading: true } };
export const Dark: Story = { globals: { theme: 'dark' } };
export const DisabledDark: Story = {
  args: { disabled: true },
  globals: { theme: 'dark' },
};
export const Russian: Story = {
  args: { preview: '1 810 ккал' },
  globals: { locale: 'ru' },
};
/** D.1: just the Save button in the sticky column. */
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
export const DesktopDark: Story = {
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
