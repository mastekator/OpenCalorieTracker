import type { Meta, StoryObj } from '@storybook/react-vite';
import { MacroSplit } from './MacroSplit';

const meta = {
  title: 'UI/MacroSplit',
  component: MacroSplit,
  args: { protein: 128, fat: 92, carbs: 355 },
} satisfies Meta<typeof MacroSplit>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Manual goal, high protein. */
export const HighProtein: Story = {
  args: { protein: 150, fat: 67, carbs: 150 },
};
export const Dark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
