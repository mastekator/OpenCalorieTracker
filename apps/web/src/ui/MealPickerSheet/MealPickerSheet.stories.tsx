import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MEALS } from '../../features/kitchen/fixtures';
import { MealPickerSheet } from './MealPickerSheet';

/** OCT-160 1.5: «From a meal» — recent meals, a tap opens the recipe editor. */
const meta = {
  title: 'UI/MealPickerSheet',
  component: MealPickerSheet,
  args: { open: true, meals: MEALS, onPick: fn(), onClose: fn() },
} satisfies Meta<typeof MealPickerSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

export const List: Story = {};
export const ListDark: Story = { globals: dark };
export const ListRussian: Story = { globals: { locale: 'ru' } };
export const ListDesktop: Story = { globals: desktop };
export const ListDesktopDark: Story = { globals: { ...desktop, ...dark } };
/** No meals with dishes in the last 30 days. */
export const Empty: Story = { args: { meals: [] } };
export const EmptyDark: Story = { args: { meals: [] }, globals: dark };
