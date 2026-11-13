import { describe, expect, it } from 'vitest';
import {
  birthDateError,
  deadlineError,
  manualNormSchema,
  profileSchema,
  targetWeightError,
  type Profile,
} from './schemas.js';

const empty: Profile = {
  sex: null,
  birthDate: null,
  heightCm: null,
  weightKg: null,
  activity: null,
  goal: null,
  targetWeightKg: null,
  deadline: null,
};
const full: Profile = {
  sex: 'male',
  birthDate: '1996-01-01',
  heightCm: 180,
  weightKg: 90,
  activity: 'moderate',
  goal: 'lose',
  targetWeightKg: 80,
  deadline: '2026-03-12',
};

const paths = (input: unknown) => {
  const r = profileSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('profileSchema', () => {
  it('accepts an empty and a full profile', () => {
    expect(paths(empty)).toEqual([]);
    expect(paths(full)).toEqual([]);
  });

  it('checks ranges in cm and kg', () => {
    expect(paths({ ...empty, heightCm: 99.9 })).toEqual(['heightCm']);
    expect(paths({ ...empty, heightCm: 250.1 })).toEqual(['heightCm']);
    expect(paths({ ...empty, weightKg: 29.9 })).toEqual(['weightKg']);
    expect(paths({ ...empty, weightKg: 300.1 })).toEqual(['weightKg']);
    expect(paths({ ...empty, birthDate: '1990-13-01' })).toEqual(['birthDate']);
  });

  it('allows target only for lose/gain and deadline only with target', () => {
    expect(paths({ ...full, goal: 'maintain' })).toEqual(['targetWeightKg']);
    expect(paths({ ...full, targetWeightKg: null })).toEqual(['deadline']);
  });
});

describe('field rules outside the schema', () => {
  it('deadline: 2 weeks to 2 years from today', () => {
    const today = '2026-01-01';
    expect(deadlineError('2026-01-14', today)).toBe('deadline_too_soon');
    expect(deadlineError('2026-01-15', today)).toBeNull();
    expect(deadlineError('2028-01-01', today)).toBeNull();
    expect(deadlineError('2028-01-02', today)).toBe('deadline_too_far');
  });

  it('birth date: not in future, age at most 100', () => {
    expect(birthDateError('2026-01-02', '2026-01-01')).toBe(
      'birth_date_in_future',
    );
    expect(birthDateError('1925-01-01', '2026-01-01')).toBe('age_over_100');
    expect(birthDateError('1925-01-02', '2026-01-01')).toBeNull();
    expect(birthDateError('2015-01-01', '2026-01-01')).toBeNull();
  });

  it('target vs current weight', () => {
    expect(targetWeightError(full)).toBeNull();
    expect(targetWeightError({ ...full, targetWeightKg: 90 })).toBe(
      'target_not_below_weight',
    );
    expect(targetWeightError({ ...full, goal: 'gain' })).toBe(
      'target_not_above_weight',
    );
    expect(targetWeightError({ ...full, weightKg: null })).toBeNull();
  });
});

describe('manualNormSchema', () => {
  const ok = { kcal: 2000, proteinPct: 20, fatPct: 30, carbsPct: 50 };
  it('accepts 800–6000 integer kcal and percentages summing to 100', () => {
    expect(manualNormSchema.safeParse(ok).success).toBe(true);
    expect(manualNormSchema.safeParse({ ...ok, kcal: 799 }).success).toBe(
      false,
    );
    expect(manualNormSchema.safeParse({ ...ok, kcal: 6001 }).success).toBe(
      false,
    );
    expect(manualNormSchema.safeParse({ ...ok, kcal: 2000.5 }).success).toBe(
      false,
    );
    expect(manualNormSchema.safeParse({ ...ok, fatPct: 31 }).success).toBe(
      false,
    );
    expect(
      manualNormSchema.safeParse({ ...ok, fatPct: 29.5, carbsPct: 50.5 })
        .success,
    ).toBe(false);
  });
});
