import { addDays, ageYears, daysBetween } from './dates.js';
import {
  ACTIVITY_FACTORS,
  KCAL_FLOOR,
  type ManualNorm,
  type Profile,
} from './schemas.js';

export { ageYears };

/** Fields the formula needs, in form order (AC-1.3). */
export const REQUIRED_FIELDS = [
  'sex',
  'birthDate',
  'heightCm',
  'weightKg',
  'activity',
  'goal',
] as const;
export type FieldKey = (typeof REQUIRED_FIELDS)[number];

export type PaceLevel = 'ok' | 'fast' | 'danger' | 'gain_fast';
export type NormWarning = 'bmi_check' | 'bmi_risk' | 'goal_reached';

export interface NormSteps {
  ageYears: number;
  bmr: number;
  activityFactor: number;
  tdee: number;
  deltaKcal: number;
  beforeFloor: number;
  floor: 'clamped' | 'tdee_below_floor' | null;
}

export interface NormPace {
  /** Planned change in the goal's direction, always positive. */
  kgPerWeek: number;
  pctPerWeek: number;
  level: PaceLevel;
  source: 'deadline' | 'default';
  /** When the target is reached at the actual pace: target without a usable deadline, or the floor clamped the norm (AC-2.1a). */
  etaDate: string | null;
  /** Deadline for 1 % a week, for "Push the deadline" (only when losing too fast). */
  safeDeadline: string | null;
  deadlineOverdue: boolean;
}

export interface Macros {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export type NormResult =
  | { status: 'incomplete'; missing: FieldKey[] }
  | { status: 'minor' }
  | ({
      status: 'ok';
      steps: NormSteps;
      pace: NormPace | null;
      warnings: NormWarning[];
    } & Macros);

const KCAL_PER_KG = 7700;
const DEFAULT_PACE_PCT = { lose: 0.5, gain: 0.25 };
const SAFE_LOSE_PCT = 1;
// Thresholds compare with a tolerance so "exactly 1 %" does not flip on float error.
const EPS = 1e-9;

const levelOf = (goal: 'lose' | 'gain', pct: number): PaceLevel => {
  if (goal === 'gain') return pct > 0.5 + EPS ? 'gain_fast' : 'ok';
  if (pct > 1.5 + EPS) return 'danger';
  return pct > 1 + EPS ? 'fast' : 'ok';
};

/** Days to cover `kg` at `kgPerWeek`, from today. */
const dateAfter = (today: string, kg: number, kgPerWeek: number) =>
  addDays(today, Math.ceil((kg / kgPerWeek) * 7));

/** Mifflin–St Jeor norm with pace, floor and macros (product OCT-5 §2, ADR-0014 §3). */
export const calculateNorm = (profile: Profile, today: string): NormResult => {
  const missing = REQUIRED_FIELDS.filter((k) => profile[k] === null);
  const { sex, birthDate, heightCm, weightKg, activity, goal } = profile;
  if (
    sex === null ||
    birthDate === null ||
    heightCm === null ||
    weightKg === null ||
    activity === null ||
    goal === null
  )
    return { status: 'incomplete', missing };

  const age = ageYears(birthDate, today);
  if (age < 18) return { status: 'minor' };

  const bmr =
    10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const activityFactor = ACTIVITY_FACTORS[activity];
  const tdee = bmr * activityFactor;
  const { targetWeightKg: target, deadline } = profile;

  let pace: NormPace | null = null;
  let deltaKcal = 0;
  let goalReached = false;
  if (goal !== 'maintain') {
    goalReached =
      target !== null &&
      (goal === 'lose' ? weightKg <= target : weightKg >= target);
    const deadlineOverdue = deadline !== null && deadline <= today;
    const byDeadline =
      target !== null && deadline !== null && !deadlineOverdue && !goalReached;
    const kgPerWeek = byDeadline
      ? Math.abs(weightKg - target) / (daysBetween(today, deadline) / 7)
      : (weightKg * DEFAULT_PACE_PCT[goal]) / 100;
    const pctPerWeek = (kgPerWeek / weightKg) * 100;
    const level = levelOf(goal, pctPerWeek);
    deltaKcal = ((goal === 'lose' ? -1 : 1) * kgPerWeek * KCAL_PER_KG) / 7;
    pace = {
      kgPerWeek,
      pctPerWeek,
      level,
      source: byDeadline ? 'deadline' : 'default',
      etaDate: null,
      safeDeadline:
        byDeadline && goal === 'lose' && level !== 'ok'
          ? dateAfter(
              today,
              weightKg - target,
              (weightKg * SAFE_LOSE_PCT) / 100,
            )
          : null,
      deadlineOverdue,
    };
  }

  const beforeFloor = tdee + deltaKcal;
  let kcalRaw = beforeFloor;
  let floor: NormSteps['floor'] = null;
  if (goal === 'lose') {
    const min = KCAL_FLOOR[sex];
    if (tdee < min) {
      kcalRaw = tdee;
      floor = 'tdee_below_floor';
    } else if (beforeFloor < min) {
      kcalRaw = min;
      floor = 'clamped';
    }
  }

  if (
    pace &&
    target !== null &&
    !goalReached &&
    (pace.source === 'default' || floor === 'clamped')
  ) {
    const actualKgPerWeek = (Math.abs(kcalRaw - tdee) * 7) / KCAL_PER_KG;
    if (actualKgPerWeek > 0)
      pace.etaDate = dateAfter(
        today,
        Math.abs(weightKg - target),
        actualKgPerWeek,
      );
  }

  const kcal = Math.round(kcalRaw / 10) * 10;
  // Protein per kg within 10–35 % of kcal; carbs from unrounded fat kcal (AC-2.2).
  const protein = Math.min(
    Math.max(1.6 * weightKg, (0.1 * kcal) / 4),
    (0.35 * kcal) / 4,
  );
  const fatKcal = kcal * 0.3;

  const m2 = (heightCm / 100) ** 2;
  const bmi = weightKg / m2;
  const warnings: NormWarning[] = [];
  if (bmi < 16 || bmi > 50) warnings.push('bmi_check');
  if (
    (goal === 'lose' && bmi < 18.5) ||
    (goal === 'gain' && bmi >= 30) ||
    (target !== null && target / m2 < 18.5)
  )
    warnings.push('bmi_risk');
  if (goalReached) warnings.push('goal_reached');

  return {
    status: 'ok',
    kcal,
    proteinG: Math.round(protein),
    fatG: Math.round(fatKcal / 9),
    carbsG: Math.round((kcal - protein * 4 - fatKcal) / 4),
    steps: {
      ageYears: age,
      bmr,
      activityFactor,
      tdee,
      deltaKcal,
      beforeFloor,
      floor,
    },
    pace,
    warnings,
  };
};

export type EffectiveNorm = { source: 'calculated' | 'manual' } & Macros;

/** The norm the day's remainder is counted from: manual wins, else calculated, else none. */
export const effectiveNorm = (
  profile: Profile,
  manual: ManualNorm | null,
  today: string,
): EffectiveNorm | null => {
  if (manual) {
    const { kcal } = manual;
    return {
      source: 'manual',
      kcal,
      proteinG: Math.round((kcal * manual.proteinPct) / 100 / 4),
      fatG: Math.round((kcal * manual.fatPct) / 100 / 9),
      carbsG: Math.round((kcal * manual.carbsPct) / 100 / 4),
    };
  }
  const norm = calculateNorm(profile, today);
  if (norm.status !== 'ok') return null;
  const { kcal, proteinG, fatG, carbsG } = norm;
  return { source: 'calculated', kcal, proteinG, fatG, carbsG };
};
