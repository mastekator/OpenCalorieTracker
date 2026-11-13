import { describe, expect, it } from 'vitest';
import {
  addDays,
  calculateNorm,
  type InterviewDraft,
  type InterviewTurn,
  type Profile,
} from '@oct/shared';
import { advanceInterview } from './advance.js';

const today = '2026-11-13';
const metric = { units: 'metric' as const, today };
const us = { units: 'us' as const, today };

const emptyProfile: Profile = {
  sex: null,
  birthDate: null,
  heightCm: null,
  weightKg: null,
  activity: null,
  goal: null,
  targetWeightKg: null,
  deadline: null,
};
const draftOf = (profile: Partial<Profile> = {}): InterviewDraft => ({
  profile: { ...emptyProfile, ...profile },
  unknown: [],
  paceWarned: null,
});
const adult: Partial<Profile> = {
  sex: 'male',
  birthDate: '1996-01-01',
  heightCm: 180,
  weightKg: 90,
  activity: 'moderate',
};
const turn = (
  extracted: InterviewTurn['extracted'],
  reply = 'Next?',
): InterviewTurn => ({ extracted, reply });

describe('advanceInterview', () => {
  it('takes several fields at once and asks the next one (AC-5.3, AC-5.4)', () => {
    const r = advanceInterview(
      draftOf(),
      turn({
        sex: 'male',
        ageYears: 34,
        height: { value: 182, unit: 'unspecified' },
        weight: { value: 85, unit: 'unspecified' },
      }),
      metric,
    );
    expect(r.draft.profile).toMatchObject({
      sex: 'male',
      birthDate: '1992-11-13',
      heightCm: 182,
      weightKg: 85,
    });
    expect(r.state).toBe('active');
    expect(r.messages).toEqual([
      { kind: 'text', text: 'Next?', ask: 'activity' },
    ]);
  });

  it('asks kg or lb for "180" in metric instead of saving it (AC-5.3a)', () => {
    const r = advanceInterview(
      draftOf(),
      turn({ weight: { value: 180, unit: 'unspecified' } }),
      metric,
    );
    expect(r.draft.profile.weightKg).toBeNull();
    expect(r.messages).toEqual([
      { kind: 'text', text: 'Next?' },
      {
        kind: 'unit_check',
        field: 'weightKg',
        value: 180,
        asUnit: 'lb',
        converted: 81.6,
      },
    ]);
  });

  it('asks lb or kg for "70" in US units', () => {
    const r = advanceInterview(
      draftOf(),
      turn({ weight: { value: 70, unit: 'unspecified' } }),
      us,
    );
    expect(r.messages[1]).toMatchObject({
      kind: 'unit_check',
      asUnit: 'kg',
      converted: 154.3,
    });
  });

  it('converts feet and pounds in metric settings on the server', () => {
    const r = advanceInterview(
      draftOf(),
      turn({
        height: { value: 72, unit: 'in' },
        weight: { value: 190, unit: 'lb' },
      }),
      metric,
    );
    expect(r.draft.profile.heightCm).toBeCloseTo(182.88, 6);
    expect(r.draft.profile.weightKg).toBeCloseTo(86.183, 3);
    expect(r.messages).toHaveLength(1);
  });

  it('rejects an out-of-range height and keeps the old one (AC-5.5)', () => {
    const r = advanceInterview(
      draftOf({ heightCm: 180 }),
      turn({ height: { value: 300, unit: 'unspecified' } }),
      metric,
    );
    expect(r.draft.profile.heightCm).toBe(180);
    expect(r.messages[1]).toEqual({
      kind: 'invalid',
      field: 'heightCm',
      min: 100,
      max: 250,
    });
    expect(r.messages[0]).not.toHaveProperty('ask');
  });

  it('takes the latest answer on a contradiction (E-5.3)', () => {
    const r = advanceInterview(
      draftOf({ birthDate: '2001-01-01' }),
      turn({ ageYears: 52 }),
      metric,
    );
    expect(r.draft.profile.birthDate).toBe('1974-11-13');
  });

  it('stops at 16 years (AC-4.2)', () => {
    const r = advanceInterview(draftOf(), turn({ ageYears: 16 }), metric);
    expect(r.state).toBe('minor');
    expect(r.messages).toEqual([
      { kind: 'text', text: 'Next?' },
      { kind: 'minor' },
    ]);
  });

  it('asks target and deadline only for lose/gain', () => {
    const lose = advanceInterview(
      draftOf(adult),
      turn({ goal: 'lose' }),
      metric,
    );
    expect(lose.messages[0]).toMatchObject({ ask: 'targetWeightKg' });
    const target = advanceInterview(
      lose.draft,
      turn({ targetWeight: { value: 80, unit: 'kg' } }),
      metric,
    );
    expect(target.messages[0]).toMatchObject({ ask: 'deadline' });
  });

  it('rejects a lose target above the current weight', () => {
    const r = advanceInterview(
      draftOf({ ...adult, goal: 'lose' }),
      turn({ targetWeight: { value: 95, unit: 'kg' } }),
      metric,
    );
    expect(r.draft.profile.targetWeightKg).toBeNull();
    expect(r.messages[1]).toEqual({
      kind: 'invalid',
      field: 'targetWeightKg',
      max: 90,
    });
  });

  it('drops an earlier target that a corrected weight puts on the wrong side', () => {
    const r = advanceInterview(
      draftOf({
        ...adult,
        goal: 'lose',
        targetWeightKg: 80,
        deadline: addDays(today, 90),
      }),
      turn({ weight: { value: 78, unit: 'kg' } }),
      metric,
    );
    expect(r.draft.profile).toMatchObject({
      weightKg: 78,
      targetWeightKg: null,
      deadline: null,
    });
    expect(r.messages[1]).toEqual({
      kind: 'invalid',
      field: 'targetWeightKg',
      max: 78,
    });
  });

  it('warns about a fast pace once, then shows the summary (AC-5.1a)', () => {
    const deadline = addDays(today, 70);
    const first = advanceInterview(
      draftOf({ ...adult, goal: 'lose', targetWeightKg: 80 }),
      turn({ deadline }),
      metric,
    );
    expect(first.state).toBe('active');
    expect(first.messages[1]).toEqual({
      kind: 'pace',
      level: 'fast',
      deadline,
      safeDeadline: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    const keep = advanceInterview(first.draft, turn({}), metric);
    expect(keep.state).toBe('summary');
    expect(keep.messages[1]).toMatchObject({ kind: 'summary' });
  });

  it('shows the summary with the norm from calculateNorm', () => {
    const r = advanceInterview(
      draftOf(adult),
      turn({ goal: 'maintain' }),
      metric,
    );
    const profile = { ...emptyProfile, ...adult, goal: 'maintain' as const };
    expect(r.state).toBe('summary');
    expect(r.messages).toEqual([
      { kind: 'text', text: 'Next?' },
      { kind: 'summary', draft: profile, norm: calculateNorm(profile, today) },
    ]);
  });

  it('uses the default pace when the deadline is unknown', () => {
    const r = advanceInterview(
      draftOf({ ...adult, goal: 'lose', targetWeightKg: 80 }),
      turn({ deadline: 'unknown' }),
      metric,
    );
    expect(r.draft.unknown).toEqual(['deadline']);
    expect(r.state).toBe('summary');
    const summary = r.messages[1];
    expect(summary?.kind === 'summary' && summary.norm.pace?.source).toBe(
      'default',
    );
  });

  it('ignores fields the current goal does not allow and norm numbers in the reply', () => {
    const before = draftOf({ ...adult, goal: 'maintain' });
    const r = advanceInterview(
      { ...before, profile: { ...before.profile, activity: null } },
      turn(
        {
          targetWeight: { value: 70, unit: 'kg' },
          deadline: addDays(today, 100),
        },
        'Your norm is 1200 kcal.',
      ),
      metric,
    );
    expect(r.draft.profile).toEqual({ ...before.profile, activity: null });
    expect(r.messages).toEqual([
      { kind: 'text', text: 'Your norm is 1200 kcal.', ask: 'activity' },
    ]);
  });

  it('keeps out-of-range values out of the draft', () => {
    const before = draftOf(adult);
    const r = advanceInterview(
      before,
      turn({
        weight: { value: 500, unit: 'kg' },
        ageYears: 140,
        birthDate: null,
      }),
      metric,
    );
    expect(r.draft.profile).toEqual(before.profile);
    expect(r.messages.filter((m) => m.kind === 'invalid')).toHaveLength(2);
  });
});
