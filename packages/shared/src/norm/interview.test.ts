import { describe, expect, it } from 'vitest';
import { interviewTurnSchema } from './interview.js';

describe('interviewTurnSchema', () => {
  it('accepts a turn with null for unmentioned fields', () => {
    const turn = {
      extracted: {
        sex: 'male',
        ageYears: 34,
        height: { value: 182, unit: 'unspecified' },
        weight: null,
        targetWeight: 'unknown',
        deadline: '2027-06-01',
      },
      reply: 'What is your activity level?',
    };
    expect(interviewTurnSchema.parse(turn)).toEqual(turn);
  });

  it.each([
    ['an extra field', { extracted: { kcal: 1200 }, reply: 'ok' }],
    ['an extra top-level key', { extracted: {}, reply: 'ok', norm: 1200 }],
    [
      'an unknown unit',
      { extracted: { weight: { value: 80, unit: 'st' } }, reply: 'ok' },
    ],
    ['an empty reply', { extracted: {}, reply: '' }],
    ['a long reply', { extracted: {}, reply: 'x'.repeat(501) }],
  ])('rejects %s', (_, turn) => {
    expect(interviewTurnSchema.safeParse(turn).success).toBe(false);
  });
});
