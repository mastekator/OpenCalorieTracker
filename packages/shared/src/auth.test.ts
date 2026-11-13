import { describe, expect, it } from 'vitest';
import { passwordProblems } from './auth.js';

describe('passwordProblems (AC-0.8)', () => {
  it('accepts a password that meets every rule', () => {
    expect(passwordProblems('Pasta-2-go', 'me@example.com')).toEqual([]);
    expect(passwordProblems('пароль 1 ок')).toEqual([]);
  });

  it.each([
    ['a1!', ['length']],
    [`a1!${'x'.repeat(126)}`, ['length']],
    ['12345678!', ['letter']],
    ['password!', ['digit']],
    ['password1', ['symbol']],
  ])('%s breaks %o', (password, rules) => {
    expect(passwordProblems(password)).toEqual(rules);
  });

  it('counts length in characters, not UTF-16 units', () => {
    expect(passwordProblems('a1!😀😀😀😀😀')).toEqual([]);
    expect(passwordProblems('a1!😀😀')).toEqual(['length']);
  });

  it('rejects the email itself, ignoring case and edge spaces', () => {
    expect(passwordProblems('Me1@example.com', ' me1@EXAMPLE.com')).toEqual([
      'email',
    ]);
  });
});
