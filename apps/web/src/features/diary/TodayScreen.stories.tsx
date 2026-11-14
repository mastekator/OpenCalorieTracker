import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Macros, Meal } from '@oct/shared';
import { useT } from '../../i18n';
import { NavBar } from '../../ui/NavBar/NavBar';
import { atPath } from '../../ui/navStory';
import { TodayView } from './TodayScreen';

const NORM: Macros = { kcal: 2100, proteinG: 120, fatG: 70, carbsG: 240 };

const meal = (over: Partial<Meal>) =>
  ({
    id: 1,
    clientId: 'm1',
    eatenAt: '2026-11-14T05:12:00Z',
    tzOffsetMin: 180,
    localDate: '2026-11-14',
    mealType: 'breakfast',
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

const MEALS = [
  meal({
    clientId: 'm1',
    items: dishes('Oatmeal with milk', 'Coffee with milk'),
    kcal: 523,
    proteinG: 18,
    fatG: 14,
    carbsG: 80,
  }),
  meal({
    clientId: 'm2',
    mealType: 'lunch',
    eatenAt: '2026-11-14T10:24:00Z',
    photo: { id: 'demo', full: true },
    items: dishes('Buckwheat with mushrooms', 'Grilled chicken breast'),
    kcal: 716.6,
    proteinG: 50,
    fatG: 38,
    carbsG: 61,
  }),
];
const OVER = [
  ...MEALS,
  meal({
    clientId: 'm3',
    mealType: 'dinner',
    eatenAt: '2026-11-14T16:40:00Z',
    items: dishes('Pasta carbonara', 'Tiramisu'),
    kcal: 1000,
    proteinG: 28,
    fatG: 30,
    carbsG: 91,
  }),
];

/** The app screen around the view: large «Today» navbar and the content column. */
function InScreen({ children }: { children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="screen screen--wide">
      <NavBar large title={t('nav.today')} />
      <main className="screen__body">{children}</main>
    </div>
  );
}

const meta = {
  title: 'Diary/TodayScreen',
  component: TodayView,
  decorators: [(Story) => <InScreen>{Story()}</InScreen>, atPath],
  parameters: { layout: 'fullscreen' },
  args: {
    today: '2026-11-14',
    meals: MEALS,
    norm: NORM,
    weekRemainingKcal: 7270,
    onOpen: () => {},
    onSetNorm: () => {},
    onRetry: () => {},
  },
} satisfies Meta<typeof TodayView>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

/** 2.1 */
export const Normal: Story = {};
export const NormalDark: Story = { globals: dark };
/** 2.2 */
export const Over: Story = { args: { meals: OVER, weekRemainingKcal: -350 } };
export const OverDark: Story = { ...Over, globals: dark };
/** 2.3 */
export const NoNorm: Story = { args: { norm: null } };
export const NoNormDark: Story = { ...NoNorm, globals: dark };
/** 2.4 */
export const EmptyDay: Story = { args: { meals: [] } };
export const EmptyDayDark: Story = { ...EmptyDay, globals: dark };
/** 2.5: no norm and no meals, no onboarding. */
export const FirstRun: Story = { args: { meals: [], norm: null } };
export const FirstRunDark: Story = { ...FirstRun, globals: dark };
/** 2.6: skeletons after 300 ms. */
export const Loading: Story = { args: { meals: undefined, norm: undefined } };
export const LoadingDark: Story = { ...Loading, globals: dark };
/** 2.7: nothing loaded; capture still works. */
export const LoadError: Story = { args: { meals: [], norm: 'error' } };
export const LoadErrorDark: Story = { ...LoadError, globals: dark };
/** The norm failed but the local copy has meals: the list stays. */
export const NormErrorWithMeals: Story = { args: { norm: 'error' } };
/** A meal just saved flashes accent-soft (OCT-16 A.6). */
export const JustSaved: Story = { args: { highlight: 'm2' } };
export const Russian: Story = { globals: { locale: 'ru' } };
/** D.1: 3 : 2, drop zone and «Enter manually» on the right. */
export const Desktop: Story = { globals: desktop };
export const DesktopDark: Story = { globals: { ...desktop, ...dark } };
export const DesktopEmpty: Story = { ...EmptyDay, globals: desktop };
