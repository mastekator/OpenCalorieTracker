import type { Meta, StoryObj } from '@storybook/react-vite';
import { addDays, type Profile } from '@oct/shared';
import { EMPTY_PROFILE } from '../../data/DataContext';
import { WeightCard, type CardWeighing } from './WeightCard';

const TODAY = '2026-11-16';
// Every other day for four weeks, drifting down from 81.4 to 80.2 today.
const DIARY: CardWeighing[] = Array.from({ length: 14 }, (_, i) => ({
  date: addDays(TODAY, 2 * i - 28),
  weightKg: Math.round((81.4 - i * 0.08 + (i % 3) * 0.2) * 10) / 10,
  status: 'synced' as const,
})).concat({ date: TODAY, weightKg: 80.2, status: 'synced' });

const PROFILE = {
  ...EMPTY_PROFILE,
  profile: {
    sex: 'male',
    birthDate: '1990-03-10',
    heightCm: 180,
    weightKg: 80.2,
    activity: 'light',
    goal: 'lose',
    targetWeightKg: 73,
    deadline: null,
  },
  rev: 1,
} satisfies NonNullable<Parameters<typeof WeightCard>[0]['profile']>;

const withGoal = (over: Partial<Profile>) => ({
  ...PROFILE,
  profile: { ...PROFILE.profile, ...over },
});
const last = (status: CardWeighing['status']) =>
  DIARY.map((w, i) => (i === DIARY.length - 1 ? { ...w, status } : w));
const REACHED = DIARY.map((w) => ({
  ...w,
  weightKg: Math.round((w.weightKg - 7.4) * 10) / 10,
}));

const meta = {
  title: 'Screens/Weight/WeightCard',
  component: WeightCard,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 'var(--content-max-width)' }}>{Story()}</div>
    ),
  ],
  args: {
    today: TODAY,
    units: 'metric',
    weighings: DIARY,
    profile: PROFILE,
    online: true,
    onAdd: () => {},
    onOpen: () => {},
    onSetGoal: () => {},
    onMaintain: async () => {},
    onRetry: () => {},
  },
} satisfies Meta<typeof WeightCard>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** 1.1: weight, change, 30-day chart with the goal dashed, goal left. */
export const Normal: Story = {};
export const NormalDark: Story = { globals: dark };
export const Russian: Story = { globals: { locale: 'ru' } };
/** 1.2 */
export const Empty: Story = { args: { weighings: [] } };
export const EmptyDark: Story = { ...Empty, globals: dark };
/** 1.3 */
export const OneWeighing: Story = { args: { weighings: DIARY.slice(-1) } };
export const OneWeighingDark: Story = { ...OneWeighing, globals: dark };
/** 1.4: «Not now» leaves «Goal 73 kg · reached» (until the profile changes). */
export const GoalReached: Story = { args: { weighings: REACHED } };
export const GoalReachedDark: Story = { ...GoalReached, globals: dark };
export const GoalReachedOffline: Story = {
  args: { weighings: REACHED, online: false },
};
/** 1.5 */
export const NoGoal: Story = {
  args: { profile: withGoal({ goal: null, targetWeightKg: null }) },
};
export const NoGoalDark: Story = { ...NoGoal, globals: dark };
export const Maintain: Story = {
  args: { profile: withGoal({ goal: 'maintain', targetWeightKg: null }) },
};
export const MaintainDark: Story = { ...Maintain, globals: dark };
export const UnderEighteen: Story = {
  args: { profile: withGoal({ birthDate: '2010-01-01' }) },
};
export const Pounds: Story = { args: { units: 'us' } };
export const PoundsDark: Story = { ...Pounds, globals: dark };
/** 1.6 */
export const Loading: Story = { args: { weighings: undefined } };
export const LoadingDark: Story = { ...Loading, globals: dark };
export const Pending: Story = { args: { weighings: last('pending') } };
export const PendingDark: Story = { ...Pending, globals: dark };
export const PendingRussian: Story = { ...Pending, globals: { locale: 'ru' } };
export const Refused: Story = { args: { weighings: last('error') } };
export const RefusedDark: Story = { ...Refused, globals: dark };
