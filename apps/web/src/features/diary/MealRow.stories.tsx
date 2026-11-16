import type { Meta, StoryObj } from '@storybook/react-vite';
import { matchIllustration, type Meal } from '@oct/shared';
import { DataContext } from '../../data/DataContext';
import type { Db, Op } from '../../data/db';
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
// First dish has the most kcal, so it gives the illustration of a meal without a photo.
const dishes = (...names: string[]) =>
  names.map((name, i) => ({
    name,
    illustration: matchIllustration(name),
    kcal: 100 - i,
  })) as Meal['items'];

// No API in Storybook: the photo fails to load and falls back to the illustration, like offline.
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

function Meals({
  desktop = false,
  highlight = false,
}: {
  desktop?: boolean;
  highlight?: boolean;
}) {
  const { t } = useT();
  return (
    <List title={t('today.meals')}>
      {MEALS.map((m) => (
        <MealRow
          key={m.id}
          meal={m}
          onOpen={() => {}}
          onDelete={desktop ? () => {} : undefined}
          highlight={highlight && m.id === 3}
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

/** Photo, no photo (dish illustration), late badge, long dishes truncated. */
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
/** A just-saved meal flashes accent-soft (OCT-16 A.6). */
export const JustSaved: Story = { args: { highlight: true } };

// Queue states by clientId: what mealStatus reads from the outbox.
const OPS: Record<string, Partial<Op>[]> = {
  queued: [{ kind: 'createMeal' }],
  refused: [{ kind: 'createMeal', error: 'validation_failed' }],
};
const stubDb = {
  getAllFromIndex: async (_store: string, _index: string, id: string) =>
    OPS[id] ?? [],
} as unknown as Db;

/** OCT-206: «waiting to sync», «not saved» (before «late»), a saved meal without a badge. */
export const SyncStatus: Story = {
  render: () => (
    <DataContext value={stubDb}>
      <List title="Today">
        {[
          meal({
            clientId: 'queued',
            items: dishes('Oatmeal with milk', 'Coffee with milk'),
            kcal: 523,
          }),
          {
            ...MEALS[0]!,
            clientId: 'refused',
          },
          meal({
            clientId: 'saved',
            mealType: 'breakfast',
            items: dishes('Buckwheat with mushrooms'),
            kcal: 310,
          }),
        ].map((m) => (
          <MealRow key={m.clientId} meal={m} onOpen={() => {}} />
        ))}
      </List>
    </DataContext>
  ),
};
export const SyncStatusDark: Story = {
  ...SyncStatus,
  globals: { theme: 'dark' },
};
export const SyncStatusNarrow: Story = {
  ...SyncStatus,
  globals: { viewport: { value: 'iphoneSE' } },
};
