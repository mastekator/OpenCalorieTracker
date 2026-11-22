import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { Meal } from '@oct/shared';
import { ConflictSheet } from './ConflictSheet';

const dish = (name: string, grams: number, kcal: number) =>
  ({
    name,
    grams,
    unit: 'g',
    kcal,
    proteinG: 0,
    fatG: 0,
    carbsG: 0,
  }) as Meal['items'][number];

// OCT-157: dinner on 12 Nov, edited offline on the phone at 19:55 and on the laptop at 20:10.
const meal = (over: Partial<Meal>): Meal => ({
  id: 5,
  clientId: '00000000-0000-4000-8000-000000000005',
  eatenAt: '2026-11-12T19:30:00Z',
  tzOffsetMin: 0,
  localDate: '2026-11-12',
  mealType: 'dinner',
  photo: null,
  recalcOffer: false,
  items: [],
  kcal: 0,
  proteinG: 0,
  fatG: 0,
  carbsG: 0,
  editRev: 4,
  editedAt: Date.UTC(2026, 10, 12, 20, 10),
  ...over,
});

const soup = dish('Chicken soup', 300, 240);
const bread = dish('Rye bread', 60, 150);
const MINE = meal({
  items: [
    dish('Chicken soup', 400, 320),
    bread,
    dish('Sour cream sauce', 40, 92),
  ],
  kcal: 562,
});
const THEIRS = meal({
  items: [soup, bread, dish('Tea with lemon', 250, 30)],
  kcal: 420,
});

const meta = {
  title: 'Sync/ConflictSheet',
  component: ConflictSheet,
  args: {
    mine: MINE,
    editedAt: Date.UTC(2026, 10, 12, 19, 55),
    theirs: THEIRS,
    units: 'metric',
    onKeep: fn(),
    onClose: fn(),
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ConflictSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const desktop = { viewport: { value: 'desktop' } };

/** 2.1: dishes differ, one only in each version, the same one folded as unchanged. */
export const Dishes: Story = {};
export const DishesDark: Story = { globals: { theme: 'dark' } };
export const DishesDesktop: Story = {
  args: { desktop: true },
  globals: desktop,
};
export const DishesDesktopDark: Story = {
  args: { desktop: true },
  globals: { ...desktop, theme: 'dark' },
};

/** 2.2: meal type, date and time, photo. */
export const Fields: Story = {
  args: {
    mine: meal({
      items: [soup],
      kcal: 240,
      mealType: 'snack',
      eatenAt: '2026-11-13T09:00:00Z',
      localDate: '2026-11-13',
    }),
    theirs: meal({ items: [soup], kcal: 240, photo: { id: 'p1', full: true } }),
  },
};
export const FieldsDark: Story = { ...Fields, globals: { theme: 'dark' } };

/** 2.3: the first of three meals waiting. */
export const Several: Story = { args: { progress: { i: 1, n: 3 } } };
export const SeveralDesktop: Story = {
  args: { progress: { i: 2, n: 3 }, desktop: true },
  globals: desktop,
};

/** 2.4: theirs changed while open; a tap on the old one would not apply. */
export const Updated: Story = { args: { updated: true } };
export const UpdatedDark: Story = {
  args: { updated: true },
  globals: { theme: 'dark' },
};
export const UpdatedDesktop: Story = {
  args: { updated: true, desktop: true },
  globals: desktop,
};
