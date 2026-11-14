import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Meal } from '@oct/shared';
import { useT } from '../../i18n';
import { List } from '../../ui/List/List';
import { MealRow } from './MealRow';

const meal = (over: Partial<Meal>) =>
  ({
    id: 1,
    clientId: '00000000-0000-4000-8000-000000000001',
    eatenAt: '2026-11-13T10:24:00Z',
    tzOffsetMin: 180,
    localDate: '2026-11-13',
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

// No API in Storybook: the photo thumbnail shows its surface-2 placeholder.
const MEALS = [
  meal({
    id: 3,
    mealType: 'snack',
    eatenAt: '2026-11-13T21:35:00Z',
    localDate: '2026-11-13',
    tzOffsetMin: 180, // 00:35 next day: late
    items: dishes('Cottage cheese bar', 'Tea'),
    kcal: 380.4,
  }),
  meal({
    id: 2,
    photo: { id: 'demo', full: true },
    items: dishes(
      'Buckwheat with mushrooms',
      'Grilled chicken breast',
      'Egg',
      'Cucumber salad',
    ),
    kcal: 716.6,
  }),
  meal({
    id: 1,
    mealType: 'breakfast',
    eatenAt: '2026-11-13T05:12:00Z',
    items: dishes('Oatmeal with milk', 'Coffee with milk'),
    kcal: 523,
  }),
];

function Meals({ desktop = false }: { desktop?: boolean }) {
  const { t } = useT();
  return (
    <List title={t('today.meals')}>
      {MEALS.map((m) => (
        <MealRow
          key={m.id}
          meal={m}
          onOpen={() => {}}
          onDelete={desktop ? () => {} : undefined}
        />
      ))}
    </List>
  );
}

const meta = {
  title: 'Diary/MealRow',
  component: Meals,
} satisfies Meta<typeof Meals>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Photo, no photo (utensils), late badge, long dishes truncated. */
export const Phone: Story = {};
export const Narrow: Story = { globals: { viewport: { value: 'iphoneSE' } } };
export const Hover: Story = {
  args: { desktop: true },
  globals: { viewport: { value: 'desktop' } },
  parameters: { pseudo: { hover: true } },
};
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};
/** D.2: trash button instead of swipe. */
export const Desktop: Story = {
  args: { desktop: true },
  globals: { viewport: { value: 'desktop' } },
};
/** 6.3 on the phone: «Delete» shown (by swipe, or here by keyboard focus). */
export const SwipeOpen: Story = {
  args: { desktop: true },
  parameters: {
    pseudo: { focusVisible: ['.meal-row:first-child .meal-row__delete'] },
  },
};
export const SwipeOpenDark: Story = {
  ...SwipeOpen,
  globals: { theme: 'dark' },
};
export const Dark: Story = { globals: { theme: 'dark' } };
