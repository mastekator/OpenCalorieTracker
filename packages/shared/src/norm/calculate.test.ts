import { describe, expect, it } from 'vitest';
import { ftInToCm, weightToKg } from '../units.js';
import { calculateNorm, effectiveNorm, type NormResult } from './calculate.js';
import type { Profile } from './schemas.js';

const today = '2026-01-01';
const base: Profile = {
  sex: 'male',
  birthDate: '1996-01-01', // 30 on `today`
  heightCm: 180,
  weightKg: 80,
  activity: 'moderate',
  goal: 'maintain',
  targetWeightKg: null,
  deadline: null,
};

const ok = (p: Partial<Profile>, day = today) => {
  const r: NormResult = calculateNorm({ ...base, ...p }, day);
  if (r.status !== 'ok') throw new Error(`expected ok, got ${r.status}`);
  return r;
};
const macros = (r: ReturnType<typeof ok>) => [
  r.kcal,
  r.proteinG,
  r.fatG,
  r.carbsG,
];

describe('calculateNorm: reference examples 2.6', () => {
  it('1. man, maintain → 2760', () => {
    const r = ok({});
    expect(r.steps.bmr).toBe(1780);
    expect(r.steps.tdee).toBeCloseTo(2759, 9);
    expect(macros(r)).toEqual([2760, 128, 92, 355]);
    expect(r.pace).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it('2. woman, lose without target → 1250', () => {
    const r = ok({
      sex: 'female',
      heightCm: 165,
      weightKg: 60,
      activity: 'minimal',
      goal: 'lose',
    });
    expect(r.steps.bmr).toBeCloseTo(1320.25, 9);
    expect(r.steps.deltaKcal).toBeCloseTo(-330, 9);
    expect(macros(r)).toEqual([1250, 96, 42, 123]);
    expect(r.steps.floor).toBeNull();
    expect(r.pace).toMatchObject({
      kgPerWeek: 0.3,
      level: 'ok',
      source: 'default',
      etaDate: null,
    });
    expect(r.warnings).toEqual([]);
  });

  it('3. man, lose 10 kg in 10 weeks → 1810, fast pace', () => {
    const r = ok({
      weightKg: 90,
      goal: 'lose',
      targetWeightKg: 80,
      deadline: '2026-03-12',
    });
    expect(r.steps.bmr).toBe(1880);
    expect(r.steps.deltaKcal).toBeCloseTo(-1100, 9);
    expect(macros(r)).toEqual([1810, 144, 60, 173]);
    expect(r.pace).toMatchObject({
      kgPerWeek: 1,
      level: 'fast',
      source: 'deadline',
      etaDate: null,
      safeDeadline: '2026-03-20', // 10 kg at 0.9 kg/week = 78 days
      deadlineOverdue: false,
    });
    expect(r.pace!.pctPerWeek).toBeCloseTo(1.11, 2);
  });

  it('4. woman 60, TDEE below floor → 1110 without deficit', () => {
    const r = ok({
      sex: 'female',
      birthDate: '1966-01-01',
      heightCm: 150,
      weightKg: 45,
      activity: 'minimal',
      goal: 'lose',
    });
    expect(r.steps.bmr).toBeCloseTo(926.5, 9);
    expect(r.steps.floor).toBe('tdee_below_floor');
    expect(macros(r)).toEqual([1110, 72, 37, 122]);
    expect(r.pace!.etaDate).toBeNull();
  });

  it('5. woman, lose 5 kg in 3 weeks → clamped to 1200 with real eta', () => {
    const r = ok({
      sex: 'female',
      heightCm: 165,
      weightKg: 60,
      activity: 'minimal',
      goal: 'lose',
      targetWeightKg: 55,
      deadline: '2026-01-22',
    });
    expect(r.steps.floor).toBe('clamped');
    expect(r.steps.beforeFloor).toBeLessThan(1200);
    expect(r.kcal).toBe(1200);
    expect(r.pace).toMatchObject({ level: 'danger', source: 'deadline' });
    expect(r.pace!.pctPerWeek).toBeCloseTo(2.78, 2);
    // 384.3 kcal/day deficit → 0.349 kg/week → 5 kg in 101 days
    expect(r.pace!.etaDate).toBe('2026-04-12');
  });

  it('6. US units: 5′11″, 176.4 lb → 2760 like example 1', () => {
    const r = ok({
      heightCm: ftInToCm(5, 11),
      weightKg: weightToKg(176.4, 'us'),
    });
    expect(r.steps.bmr).toBeCloseTo(1782.3, 1);
    expect(r.steps.tdee).toBeCloseTo(2762.5, 1);
    expect(r.kcal).toBe(2760);
  });
});

describe('calculateNorm: pace thresholds on the boundary', () => {
  const plan = (target: number, days: number) =>
    ok({
      weightKg: 100,
      goal: target < 100 ? 'lose' : 'gain',
      targetWeightKg: target,
      deadline: new Date(Date.UTC(2026, 0, 1 + days))
        .toISOString()
        .slice(0, 10),
    }).pace!.level;

  it('lose: 1 % ok, above → fast; 1.5 % fast, above → danger', () => {
    expect(plan(90, 70)).toBe('ok');
    expect(plan(90, 69)).toBe('fast');
    expect(plan(85, 70)).toBe('fast');
    expect(plan(85, 69)).toBe('danger');
  });

  it('gain: 0.5 % ok, above → gain_fast', () => {
    expect(plan(105, 70)).toBe('ok');
    expect(plan(105, 69)).toBe('gain_fast');
  });

  it('safeDeadline only when losing too fast', () => {
    const r = ok({
      weightKg: 100,
      goal: 'lose',
      targetWeightKg: 90,
      deadline: '2026-03-12',
    });
    expect(r.pace!.safeDeadline).toBeNull();
  });
});

describe('calculateNorm: other cases', () => {
  it('target without deadline gives etaDate at default pace', () => {
    const r = ok({
      sex: 'female',
      heightCm: 165,
      weightKg: 60,
      activity: 'minimal',
      goal: 'lose',
      targetWeightKg: 55,
    });
    expect(r.kcal).toBe(1250);
    expect(r.pace!.etaDate).toBe('2026-04-28'); // 5 kg at 0.3 kg/week = 117 days
  });

  it('overdue deadline → default pace and deadlineOverdue', () => {
    const r = ok({
      weightKg: 90,
      goal: 'lose',
      targetWeightKg: 80,
      deadline: '2025-12-31',
    });
    expect(r.pace).toMatchObject({
      source: 'default',
      deadlineOverdue: true,
      kgPerWeek: 0.45,
    });
    expect(r.pace!.etaDate).not.toBeNull();
  });

  it('birthday lowers BMR by 5 (E-1.2)', () => {
    const before = ok({ birthDate: '1996-01-02' });
    const on = ok({ birthDate: '1996-01-01' });
    expect(before.steps.ageYears).toBe(29);
    expect(on.steps.ageYears).toBe(30);
    expect(before.steps.bmr - on.steps.bmr).toBe(5);
  });

  it('under 18 → minor', () => {
    expect(calculateNorm({ ...base, birthDate: '2008-01-02' }, today)).toEqual({
      status: 'minor',
    });
    expect(
      calculateNorm({ ...base, birthDate: '2008-01-01' }, today).status,
    ).toBe('ok');
  });

  it('incomplete lists missing fields', () => {
    expect(
      calculateNorm({ ...base, heightCm: null, goal: null }, today),
    ).toEqual({ status: 'incomplete', missing: ['heightCm', 'goal'] });
  });

  it('BMI warnings', () => {
    expect(ok({ weightKg: 40 }).warnings).toEqual(['bmi_check']); // 12.3
    expect(ok({ weightKg: 58, goal: 'lose' }).warnings).toEqual(['bmi_risk']); // 17.9
    expect(ok({ weightKg: 100, goal: 'gain' }).warnings).toEqual(['bmi_risk']); // 30.9
    expect(
      ok({ weightKg: 70, goal: 'lose', targetWeightKg: 59 }).warnings,
    ).toEqual(['bmi_risk']); // target 18.2
    expect(ok({ weightKg: 70, goal: 'lose' }).warnings).toEqual([]);
  });

  it('goal reached → default pace, no eta, warning', () => {
    const r = ok({
      weightKg: 79.5,
      goal: 'lose',
      targetWeightKg: 80,
      deadline: '2026-03-12',
    });
    expect(r.warnings).toEqual(['goal_reached']);
    expect(r.pace).toMatchObject({ source: 'default', etaDate: null });
  });
});

describe('effectiveNorm', () => {
  it('manual norm wins and gives grams from percentages', () => {
    expect(
      effectiveNorm(
        base,
        { kcal: 2000, proteinPct: 20, fatPct: 30, carbsPct: 50 },
        today,
      ),
    ).toEqual({
      source: 'manual',
      kcal: 2000,
      proteinG: 100,
      fatG: 67,
      carbsG: 250,
    });
  });

  it('falls back to calculated, or null when it cannot be calculated', () => {
    expect(effectiveNorm(base, null, today)).toEqual({
      source: 'calculated',
      kcal: 2760,
      proteinG: 128,
      fatG: 92,
      carbsG: 355,
    });
    expect(effectiveNorm({ ...base, sex: null }, null, today)).toBeNull();
  });
});
