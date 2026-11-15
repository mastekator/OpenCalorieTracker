import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MealEditScreen } from './MealEditScreen';

const dishes = [
  {
    name: 'Buckwheat',
    grams: 150,
    kcal: 165,
    proteinG: 6,
    fatG: 1.5,
    carbsG: 33,
    confidence: 0.97,
  },
  {
    name: 'Chicken cutlet',
    grams: 120,
    kcal: 260,
    proteinG: 22,
    fatG: 16,
    carbsG: 8,
    confidence: 0.6,
  },
  {
    name: 'Tomato salad',
    grams: 90,
    kcal: 70,
    proteinG: 1,
    fatG: 6,
    carbsG: 4,
    confidence: 0.3,
  },
];

const meta = {
  title: 'Meals/MealEditScreen',
  component: MealEditScreen,
  parameters: { layout: 'fullscreen' },
  args: {
    dishes,
    units: 'metric',
    onSave: fn(async () => {}),
    onClose: fn(),
    now: new Date(2026, 10, 15, 13, 24),
  },
} satisfies Meta<typeof MealEditScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const failing = { onSave: fn(() => Promise.reject(new Error('quota'))) };

export const Recognized: Story = {};
export const RecognizedDark: Story = { globals: dark };
/** 4.10 */
export const Ounces: Story = { args: { units: 'us' } };
export const OuncesDark: Story = { args: { units: 'us' }, globals: dark };
/** Manual entry before OCT-60: no dishes, Save disabled. */
export const NoDishes: Story = { args: { dishes: [] } };
export const NoDishesDark: Story = { args: { dishes: [] }, globals: dark };
/** 4.8: press Save to see the error banner and «Try again». */
export const SaveFails: Story = { args: failing };
export const SaveFailsDark: Story = { args: failing, globals: dark };
