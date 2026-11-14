import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  calculateNorm,
  ftInToCm,
  weightToKg,
  type Profile,
  type Units,
} from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { HowCalculated } from './HowCalculated';

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

const kcal = (n: number) =>
  `${new Intl.NumberFormat('en').format(Math.round(n))}\u00a0kcal`;
const STEPS = {
  bmr: 'What your body burns at rest (basal metabolic rate)',
  tdee: 'What you burn on a typical day',
  goal: 'Your goal',
  floor: 'Safe minimum',
  macros: 'Protein, fat, carbs',
};

async function show(profile: Profile, units: Units = 'metric') {
  const norm = calculateNorm(profile, today);
  if (norm.status !== 'ok') throw new Error(norm.status);
  render(<HowCalculated units={units} profile={profile} norm={norm} />, {
    wrapper: I18nProvider,
  });
  await screen.findByRole('heading', { level: 2 });
  const raw = document.body.textContent ?? '';
  const text = raw.replaceAll('\u00a0', ' ');
  const steps = screen
    .getAllByRole('listitem')
    .map((li) => li.querySelector('b')?.textContent)
    .filter(Boolean);
  // The card's numbers (AC-2.4b) and the intermediate ones, all from calculateNorm.
  for (const s of [
    kcal(norm.kcal),
    kcal(norm.steps.bmr),
    kcal(norm.steps.tdee),
    `Protein ${norm.proteinG}\u00a0g · Fat ${norm.fatG}\u00a0g · Carbs ${norm.carbsG}\u00a0g`,
  ])
    expect(raw).toContain(s); // numbers stay glued to their units
  return { norm, text, steps };
}

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

describe('HowCalculated (product OCT-5 §2.6 references)', () => {
  it('1: maintain — no goal or floor step', async () => {
    const { norm, text, steps } = await show(man);
    expect(norm.kcal).toBe(2760);
    expect(steps).toEqual([STEPS.bmr, STEPS.tdee, STEPS.macros]);
    expect(text).toContain('10 × 80 + 6.25 × 180 − 5 × 30 + 5 = 1,780 kcal');
    expect(text).toContain('1,780 × 1.55 = 2,759 kcal');
    expect(text).toContain('2,760 kcal');
    expect(screen.getByRole('heading', { level: 2 })).toBe(
      document.activeElement,
    );
  });

  it('3: lose 10 kg in 10 weeks — goal step with the fast-pace warning', async () => {
    const { norm, text, steps } = await show({
      ...man,
      weightKg: 90,
      goal: 'lose',
      targetWeightKg: 80,
      deadline: '2026-03-12',
    });
    expect(norm.kcal).toBe(1810);
    expect(steps).toEqual([STEPS.bmr, STEPS.tdee, STEPS.goal, STEPS.macros]);
    expect(text).toContain(
      'To lose 10 kg by March 12, you need to lose about 1 kg a week.',
    );
    expect(text).toContain('2,914 − 1,100 = 1,814 kcal. That’s a fast pace');
  });

  it('5: lose 5 kg in 3 weeks — the floor clamps the goal', async () => {
    const { norm, text, steps } = await show({
      ...woman,
      targetWeightKg: 55,
      deadline: '2026-01-22',
    });
    expect(norm.kcal).toBe(1200);
    expect(steps).toEqual([
      STEPS.bmr,
      STEPS.tdee,
      STEPS.goal,
      STEPS.floor,
      STEPS.macros,
    ]);
    expect(text).toContain('This pace may harm your health');
    expect(text).toContain('< 1,200 → 1,200 kcal');
    expect(text).toMatch(/= −\d+ kcal/);
    expect(text).not.toMatch(/-\d/);
  });

  it('4: TDEE already under the floor — no deficit', async () => {
    const { norm, text, steps } = await show({
      ...woman,
      birthDate: '1966-01-01',
      heightCm: 150,
      weightKg: 45,
    });
    expect(norm.kcal).toBe(1110);
    expect(steps).toContain(STEPS.floor);
    expect(text).toContain('1,112 < 1,200 → 1,112 kcal');
  });

  it('US units: the conversion line first, then the same goal as example 1', async () => {
    const { norm, text } = await show(
      { ...man, heightCm: ftInToCm(5, 11), weightKg: weightToKg(176.4, 'us') },
      'us',
    );
    expect(norm.kcal).toBe(2760);
    expect(text).toContain('5′ 11″ = 180.3 cm, 176.4 lb = 80 kg.');
    expect(screen.getAllByRole('listitem')[0]?.textContent).toMatch(
      /^What your body burns at rest.*5′ 11″ = /,
    );
  });

  it('US units: the goal step in pounds', async () => {
    const { text } = await show(
      {
        ...man,
        weightKg: weightToKg(198.4, 'us'),
        goal: 'lose',
        targetWeightKg: weightToKg(176.4, 'us'),
        deadline: '2026-03-12',
      },
      'us',
    );
    expect(text).toContain(
      'To lose 22 lb by March 12, you need to lose about 2.2 lb a week.',
    );
    expect(text).toContain('1 kg of fat holds about 7,700 kcal');
  });

  it('manual goal: the notice on top, the calculation below', async () => {
    const norm = calculateNorm(man, today);
    if (norm.status !== 'ok') throw new Error();
    render(
      <HowCalculated
        units="metric"
        profile={man}
        norm={norm}
        manualKcal={2000}
      />,
      { wrapper: I18nProvider },
    );
    expect((await screen.findByRole('status')).textContent).toContain(
      'You’re using a goal you set manually: 2,000\u00a0kcal.',
    );
    expect(document.body.textContent).toContain(kcal(2760));
  });

  it('no calculation: the message instead of the steps, sources still there', async () => {
    render(
      <HowCalculated
        units="metric"
        message="Fill in height to see the calculation"
      />,
      { wrapper: I18nProvider },
    );
    await screen.findByText('Fill in height to see the calculation');
    expect(screen.queryByText(STEPS.bmr)).toBeNull();
    const link = screen.getByRole('link', { name: /Mifflin/ });
    expect(link.getAttribute('href')).toBe(
      'https://doi.org/10.1093/ajcn/51.2.241',
    );
    expect(link.getAttribute('target')).toBe('_blank');
  });
});
