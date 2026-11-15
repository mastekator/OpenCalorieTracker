import type { Meta, StoryObj } from '@storybook/react-vite';
import { MacroFillDialog } from './MacroFillDialog';

const meta = {
  title: 'Screens/Profile/MacroFillDialog',
  component: MacroFillDialog,
  args: {
    open: true,
    pct: { protein: 21, fat: 30, carbs: 44 },
    filled: { protein: 21, fat: 30, carbs: 49 },
    target: 'carbs',
    onApply: () => {},
    onSelf: () => {},
  },
} satisfies Meta<typeof MacroFillDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 8.8a: 5 % left, goes to carbs. */
export const Short: Story = {};
/** 5 % over, carbs were edited last: taken from fat. */
export const Over: Story = {
  args: {
    pct: { protein: 20, fat: 30, carbs: 55 },
    filled: { protein: 20, fat: 25, carbs: 55 },
    target: 'fat',
  },
};
/** Carbs would go below 0: they stop at 0, the other two give up the rest. */
export const Split: Story = {
  args: {
    pct: { protein: 60, fat: 60, carbs: 10 },
    filled: { protein: 50, fat: 50, carbs: 0 },
    target: 'carbs',
  },
};
export const ShortDark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
