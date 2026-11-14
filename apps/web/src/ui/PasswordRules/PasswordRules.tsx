import { Check, Circle, X } from 'lucide-react';
import { PASSWORD_MIN_LENGTH } from '@oct/shared';
import { useT } from '../../i18n';
import { ruleStates } from './ruleStates';
import './PasswordRules.css';

const ICONS = { pending: Circle, ok: Check, fail: X };

type Props = {
  password: string;
  /** Adds the «not the same as your email» row. */
  email?: string;
  /** After a submit attempt unmet rules turn red. */
  attempted?: boolean;
};

/** AC-0.8 rules under the password field, visible from the start. */
export function PasswordRules({ password, email, attempted = false }: Props) {
  const { t } = useT();
  return (
    <ul className="password-rules" aria-live="polite">
      {ruleStates(password, email, attempted).map(([rule, state]) => {
        const Icon = ICONS[state];
        return (
          <li
            key={rule}
            className={`password-rules__rule password-rules__rule--${state}`}
          >
            <Icon className="password-rules__icon" aria-hidden="true" />
            {t(`pw.rule.${rule}`, { min: PASSWORD_MIN_LENGTH })}
          </li>
        );
      })}
    </ul>
  );
}
