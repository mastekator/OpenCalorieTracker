import { passwordProblems } from '@oct/shared';

export type RuleKey = 'length' | 'letter_digit' | 'symbol' | 'not_email';
/** pending: not met yet, ok: met, fail: not met after a submit attempt. */
export type RuleState = 'pending' | 'ok' | 'fail';

/** Display rows of AC-0.8 over `passwordProblems`; the email row only when an email is known. */
export function ruleStates(
  password: string,
  email: string | undefined,
  attempted: boolean,
): [RuleKey, RuleState][] {
  const problems = passwordProblems(password, email);
  const state = (broken: boolean): RuleState =>
    !broken ? 'ok' : attempted ? 'fail' : 'pending';
  const rows: [RuleKey, RuleState][] = [
    ['length', state(problems.includes('length'))],
    [
      'letter_digit',
      state(problems.includes('letter') || problems.includes('digit')),
    ],
    ['symbol', state(problems.includes('symbol'))],
  ];
  if (email) rows.push(['not_email', state(problems.includes('email'))]);
  return rows;
}
