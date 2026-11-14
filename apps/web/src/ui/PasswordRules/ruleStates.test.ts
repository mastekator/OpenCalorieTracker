import { describe, expect, it } from 'vitest';
import { ruleStates } from './ruleStates';

describe('ruleStates', () => {
  it('shows every unmet rule as pending before an attempt', () => {
    expect(ruleStates('', undefined, false)).toEqual([
      ['length', 'pending'],
      ['letter_digit', 'pending'],
      ['symbol', 'pending'],
    ]);
  });

  it('marks unmet rules as failed after an attempt, met ones as ok', () => {
    expect(ruleStates('password!', undefined, true)).toEqual([
      ['length', 'ok'],
      ['letter_digit', 'fail'],
      ['symbol', 'ok'],
    ]);
  });

  it('merges letter and digit into one row', () => {
    expect(ruleStates('12345678!', undefined, true)[1]).toEqual([
      'letter_digit',
      'fail',
    ]);
    expect(ruleStates('Pasta-2-go', undefined, true)[1]).toEqual([
      'letter_digit',
      'ok',
    ]);
  });

  it('adds the email row only when an email is given', () => {
    expect(ruleStates('Me1@example.com', 'me1@example.com', true)).toEqual([
      ['length', 'ok'],
      ['letter_digit', 'ok'],
      ['symbol', 'ok'],
      ['not_email', 'fail'],
    ]);
    expect(ruleStates('Pasta-2-go', 'me@example.com', false)[3]).toEqual([
      'not_email',
      'ok',
    ]);
  });

  it('fails the length row above the maximum', () => {
    expect(ruleStates(`a1!${'x'.repeat(126)}`, undefined, true)[0]).toEqual([
      'length',
      'fail',
    ]);
  });
});
