import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { addDays } from '@oct/shared';
import { EMPTY_PROFILE } from '../../data/DataContext';
import { useT } from '../../i18n';
import { NavBar } from '../../ui/NavBar/NavBar';
import type { CardWeighing } from './WeightCard';
import { WeightView } from './WeightScreen';

const TODAY = '2026-11-16';

/** ~70 % of days over `days` days, drifting from 86 kg down to 80.2 today (as in the prototype). */
function history(days: number, every = 0.7): CardWeighing[] {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: CardWeighing[] = [];
  for (let i = -days; i < 0; i++) {
    if (rnd() > every) continue;
    const k = (i + days) / days;
    out.push({
      date: addDays(TODAY, i),
      weightKg:
        Math.round(
          (86 - 5.3 * k + 0.5 * Math.sin(k * 7) + (rnd() - 0.5) * 1.1) * 10,
        ) / 10,
      status: 'synced',
    });
  }
  return [...out, { date: TODAY, weightKg: 80.2, status: 'synced' }];
}
const DIARY = history(400);
const TEN_YEARS = history(3650, 1);

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
} satisfies NonNullable<Parameters<typeof WeightView>[0]['profile']>;

function InScreen({ children }: { children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="screen screen--wide">
      <NavBar
        title={t('weight_card.title')}
        back={{ href: '/', label: t('nav.today') }}
      />
      <main className="screen__body">{children}</main>
    </div>
  );
}

const meta = {
  title: 'Screens/Weight/WeightScreen',
  component: WeightView,
  decorators: [(Story) => <InScreen>{Story()}</InScreen>],
  parameters: { layout: 'fullscreen' },
  args: {
    today: TODAY,
    units: 'metric',
    weighings: DIARY,
    profile: PROFILE,
    online: true,
    onAdd: fn(),
    onEdit: fn(),
    onSetGoal: fn(),
    onMaintain: fn(async () => {}),
  },
} satisfies Meta<typeof WeightView>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

/** 3.1: 3 months, pale dots, the trend, the goal dashed; the list below. */
export const Normal: Story = {};
export const NormalDark: Story = { globals: dark };
export const Russian: Story = { globals: { locale: 'ru' } };
/** 3.2: a weighing picked (← from the keyboard; a tap or a drag on a phone): line, ring, tip. */
export const Picked: Story = {
  play: async ({ canvas, userEvent }) => {
    (await canvas.findByRole('img', { name: /Weight chart/ })).focus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
  },
};
export const PickedDark: Story = { ...Picked, globals: dark };
export const Pounds: Story = { args: { units: 'us' } };
/** 3.7 */
export const OneWeighing: Story = { args: { weighings: DIARY.slice(-1) } };
export const OneWeighingDark: Story = { ...OneWeighing, globals: dark };
/** 3.6: no chart, an invitation. */
export const Empty: Story = { args: { weighings: [] } };
export const EmptyDark: Story = { ...Empty, globals: dark };
export const Loading: Story = { args: { weighings: undefined } };
export const LoadingDark: Story = { ...Loading, globals: dark };
/** Offline: unsent weighings wait in the list, they can still be edited and deleted. */
export const Waiting: Story = {
  args: {
    weighings: DIARY.map((w, i) =>
      i >= DIARY.length - 2 ? { ...w, status: 'pending' } : w,
    ),
  },
};
export const WaitingDark: Story = { ...Waiting, globals: dark };
export const NoGoal: Story = {
  args: {
    profile: {
      ...PROFILE,
      profile: { ...PROFILE.profile, goal: 'maintain', targetWeightKg: null },
    },
  },
};
/** AC-9.19: 10 years of daily weighings open and scroll without lag; «All» draws only the trend. */
export const TenYears: Story = { args: { weighings: TEN_YEARS } };
export const TenYearsDark: Story = { ...TenYears, globals: dark };
/** D.1: chart on the left, the list on the right; hover lights up the row and the dot. */
export const Desktop: Story = { globals: desktop };
export const DesktopDark: Story = { globals: { ...desktop, ...dark } };
