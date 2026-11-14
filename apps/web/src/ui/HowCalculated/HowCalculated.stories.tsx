import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  calculateNorm,
  ftInToCm,
  weightToKg,
  type Profile,
  type Units,
} from '@oct/shared';
import { useT } from '../../i18n';
import { HowCalculated } from './HowCalculated';

// Product OCT-5 §2.6 reference examples, counted on a fixed day.
const today = '2026-01-01';
const man: Profile = {
  sex: 'male',
  birthDate: '1996-01-01',
  heightCm: 180,
  weightKg: 80,
  activity: 'moderate',
  goal: 'maintain',
  targetWeightKg: null,
  deadline: null,
};
const woman: Profile = {
  ...man,
  sex: 'female',
  heightCm: 165,
  weightKg: 60,
  activity: 'minimal',
  goal: 'lose',
};

type Args = {
  profile?: Profile;
  units?: Units;
  manualKcal?: number;
  /** Shows the «fill in» message instead of the steps. */
  missing?: { en: string; ru: string };
};

function Story({ profile, units = 'metric', manualKcal, missing }: Args) {
  const { locale } = useT();
  const norm = profile && calculateNorm(profile, today);
  return profile && norm?.status === 'ok' ? (
    <HowCalculated
      units={units}
      profile={profile}
      norm={norm}
      manualKcal={manualKcal}
    />
  ) : (
    <HowCalculated
      units={units}
      manualKcal={manualKcal}
      message={missing?.[locale === 'ru' ? 'ru' : 'en'] ?? ''}
    />
  );
}

const meta = {
  title: 'UI/HowCalculated',
  component: Story,
  decorators: [
    (S) => (
      <div style={{ maxWidth: 'var(--content-max-width)' }}>
        <S />
      </div>
    ),
  ],
} satisfies Meta<typeof Story>;
export default meta;
type S = StoryObj<typeof meta>;

/** Example 1: maintain — no goal or floor step. */
export const Maintain: S = { args: { profile: man } };
/** Example 3: lose 10 kg in 10 weeks — fast pace. */
export const LoseFast: S = {
  args: {
    profile: {
      ...man,
      weightKg: 90,
      goal: 'lose',
      targetWeightKg: 80,
      deadline: '2026-03-12',
    },
  },
};
/** Example 2: lose with no date — default pace. */
export const LoseDefault: S = { args: { profile: woman } };
/** Example 5: the floor clamps the goal. */
export const FloorClamped: S = {
  args: { profile: { ...woman, targetWeightKg: 55, deadline: '2026-01-22' } },
};
/** Example 4: TDEE already under the floor. */
export const TdeeBelowFloor: S = {
  args: {
    profile: { ...woman, birthDate: '1966-01-01', heightCm: 150, weightKg: 45 },
  },
};
/** Gain with no date. */
export const Gain: S = { args: { profile: { ...man, goal: 'gain' } } };
/** US units: the conversion line first. */
export const UsUnits: S = {
  args: {
    units: 'us',
    profile: {
      ...man,
      heightCm: ftInToCm(5, 11),
      weightKg: weightToKg(176.4, 'us'),
    },
  },
};
/** US units with a goal: the goal step in pounds. */
export const UsLose: S = {
  args: {
    units: 'us',
    profile: {
      ...man,
      heightCm: ftInToCm(5, 11),
      weightKg: weightToKg(198.4, 'us'),
      goal: 'lose',
      targetWeightKg: weightToKg(176.4, 'us'),
      deadline: '2026-03-12',
    },
  },
};
/** A manual goal in force: the notice, then the calculation for comparison. */
export const Manual: S = { args: { profile: man, manualKcal: 2000 } };
/** Incomplete profile: what to fill in, no steps. */
export const Incomplete: S = {
  args: {
    missing: {
      en: 'Fill in height and activity to see the calculation',
      ru: 'Заполните рост и активность, чтобы увидеть расчёт',
    },
  },
};
