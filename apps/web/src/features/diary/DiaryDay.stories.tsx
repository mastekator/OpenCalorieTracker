import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Macros, Meal } from '@oct/shared';
import { DiaryDay } from './DiaryDay';

const TODAY = '2026-11-14';
const DAY = '2026-11-12';
const NORM: Macros = { kcal: 2100, proteinG: 120, fatG: 70, carbsG: 240 };

const meal = (over: Partial<Meal>) =>
  ({
    id: 1,
    clientId: String(over.id),
    eatenAt: `${DAY}T10:24:00Z`,
    tzOffsetMin: 180,
    localDate: DAY,
    mealType: 'lunch',
    photo: null,
    recalcOffer: false,
    items: [],
    kcal: 0,
    proteinG: 0,
    fatG: 0,
    carbsG: 0,
    ...over,
  }) as Meal;
const dishes = (...names: string[]) =>
  names.map((name) => ({ name })) as Meal['items'];

// Early to late, as useMeals gives them.
const MEALS = [
  meal({
    id: 1,
    mealType: 'breakfast',
    eatenAt: `${DAY}T05:12:00Z`,
    items: dishes('Oatmeal with milk', 'Coffee with milk'),
    kcal: 523,
    proteinG: 18,
    fatG: 14,
    carbsG: 80,
  }),
  meal({
    id: 2,
    items: dishes('Buckwheat with mushrooms', 'Grilled chicken breast'),
    kcal: 716.6,
    proteinG: 52,
    fatG: 22,
    carbsG: 70,
  }),
  meal({
    id: 3,
    mealType: 'dinner',
    eatenAt: `${DAY}T16:55:00Z`,
    items: dishes('Salmon', 'Rice', 'Salad'),
    kcal: 720.4,
    proteinG: 40,
    fatG: 26,
    carbsG: 76,
  }),
];

const noop = () => {};
const meta = {
  title: 'Diary/DiaryDay',
  component: DiaryDay,
  args: {
    date: DAY,
    today: TODAY,
    meals: MEALS,
    norm: NORM,
    onDate: noop,
    onOpen: noop,
    onDelete: noop,
    onAdd: noop,
  },
} satisfies Meta<typeof DiaryDay>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 6.1 */
export const PastDay: Story = {};
/** 6.2: «›» disabled, no «Today», «Add entry». */
export const Today: Story = {
  args: { date: TODAY, meals: MEALS.map((m) => ({ ...m, localDate: TODAY })) },
};
export const Over: Story = {
  args: {
    meals: [
      ...MEALS,
      meal({
        id: 4,
        mealType: 'snack',
        eatenAt: `${DAY}T19:00:00Z`,
        kcal: 420,
        fatG: 20,
      }),
    ],
  },
};
/** Until OCT-92 brings the norm to the client. */
export const NoNorm: Story = { args: { norm: null } };
/** 6.4 (also after deleting the last meal, E-2.1). */
export const Empty: Story = { args: { meals: [] } };
/** 6.12: skeletons after 300 ms. */
export const Loading: Story = { args: { meals: undefined } };
export const Dark: Story = { globals: { theme: 'dark' } };
export const EmptyDark: Story = {
  args: { meals: [] },
  globals: { theme: 'dark' },
};
export const Russian: Story = { globals: { locale: 'ru' } };
export const Narrow: Story = { globals: { viewport: { value: 'iphoneSE' } } };
/** D.2: list left, total and «Add» right, trash buttons. */
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
export const DesktopDark: Story = {
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
