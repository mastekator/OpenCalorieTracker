import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Profile, ProfileRequest } from '@oct/shared';
import { ApiError } from '../../api/client';
import { ProfileForm } from './ProfileForm';

const today = '2026-11-14';
const filled: Profile = {
  sex: 'male',
  birthDate: '1996-03-14',
  heightCm: 180,
  weightKg: 80,
  activity: 'moderate',
  goal: 'lose',
  targetWeightKg: 75,
  deadline: '2027-03-01',
};
const empty = Object.fromEntries(
  Object.keys(filled).map((k) => [k, null]),
) as unknown as Profile;

const meta = {
  title: 'Screens/Profile',
  component: ProfileForm,
  args: {
    initial: { profile: filled, manual: null, rev: 1 },
    units: 'metric',
    today,
    onAgent: () => {},
    onSave: async (req: ProfileRequest) => ({ ...req, rev: 2 }),
    onHideDisclaimer: () => {},
  },
  decorators: [
    (Story) => (
      <div className="screen screen--wide">
        <main className="screen__body">
          <Story />
        </main>
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileForm>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 8.4: the norm is set. Edit a field for 8.5 (preview, «not saved», save bar). */
export const Filled: Story = {};
/** 8.1: first visit, AI set up. */
export const FirstVisit: Story = {
  args: { initial: { profile: empty, manual: null, rev: 0 } },
};
/** 8.2: first visit without AI. */
export const FirstVisitNoAi: Story = {
  args: { ...FirstVisit.args, onAgent: undefined },
};
/** 8.3: height and activity missing. */
export const Incomplete: Story = {
  args: {
    initial: {
      profile: { ...filled, heightCm: null, activity: null },
      manual: null,
      rev: 1,
    },
  },
};
/** 8.11: out of range (as if typed). */
export const RangeError: Story = {
  args: {
    initial: { profile: { ...filled, heightCm: 260 }, manual: null, rev: 1 },
  },
};
/** 8.17: every save fails; edit a field and press Save. */
export const SaveFails: Story = {
  args: {
    onSave: async () => {
      throw new ApiError(0, 'internal');
    },
  },
};
/** Goal reached its date: «This date has passed». */
export const Overdue: Story = {
  args: {
    initial: {
      profile: { ...filled, deadline: '2026-11-01' },
      manual: null,
      rev: 1,
    },
  },
};
const withProfile = (p: Partial<Profile>) => ({
  initial: { profile: { ...filled, ...p }, manual: null, rev: 1 },
});
/** 8.5b: over 1 % a week, «Move the date». */
export const FastPace: Story = {
  args: withProfile({
    weightKg: 90,
    targetWeightKg: 80,
    deadline: '2027-01-23',
  }),
};
/** 8.6: over 1.5 % a week and capped at the floor, with the real date. */
export const DangerFloor: Story = {
  args: withProfile({
    sex: 'female',
    heightCm: 165,
    weightKg: 60,
    activity: 'minimal',
    targetWeightKg: 55,
    deadline: '2026-12-05',
  }),
};
/** 8.6, AC-2.1b: burns less than the floor. */
export const BelowFloor: Story = {
  args: withProfile({
    sex: 'female',
    birthDate: '1966-01-01',
    heightCm: 150,
    weightKg: 45,
    activity: 'minimal',
    targetWeightKg: null,
    deadline: null,
  }),
};
/** 8.11: implausible BMI. */
export const BmiCheck: Story = {
  args: withProfile({ weightKg: 40, goal: 'maintain' }),
};
/** 8.12: under 18, the disclaimer has no close button. */
export const Minor: Story = { args: withProfile({ birthDate: '2010-05-01' }) };
/** 8.13: target reached. */
export const GoalReached: Story = {
  args: withProfile({ weightKg: 74.5 }),
};
/** 8.21: the disclaimer was closed. */
export const DisclaimerHidden: Story = { args: { disclaimerHidden: true } };
export const FastPaceDark: Story = { ...FastPace, globals: { theme: 'dark' } };
export const GoalReachedDark: Story = {
  ...GoalReached,
  globals: { theme: 'dark' },
};
export const MinorDark: Story = { ...Minor, globals: { theme: 'dark' } };
/** 8.19: feet and inches, pounds. */
export const UsUnits: Story = { args: { units: 'us' } };
export const Dark: Story = { globals: { theme: 'dark' } };
export const FirstVisitDark: Story = {
  ...FirstVisit,
  globals: { theme: 'dark' },
};
export const RangeErrorDark: Story = {
  ...RangeError,
  globals: { theme: 'dark' },
};
export const Russian: Story = { globals: { locale: 'ru' } };
/** D.1: columns 3 : 2, the norm column sticks with Save. */
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
export const DesktopDark: Story = {
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
