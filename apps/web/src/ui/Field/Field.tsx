import { useId, useState, type InputHTMLAttributes, type Ref } from 'react';
import { CircleAlert, Eye, EyeOff, Lock } from 'lucide-react';
import { useT } from '../../i18n';
import './Field.css';

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'style' | 'id' | 'readOnly'
> & {
  label: string;
  /** Footnote under the field; hidden while an error is shown. */
  hint?: string;
  /** Error text under the field; also marks the input aria-invalid. */
  error?: string;
  /** Value set by the server (email from an invite): read-only, lock icon. */
  locked?: boolean;
  ref?: Ref<HTMLInputElement>;
};

export function Field({
  label,
  hint,
  error,
  locked = false,
  type = 'text',
  ...rest
}: Props) {
  const { t } = useT();
  const id = useId();
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';
  const note = error ?? hint;

  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className={`field__box${locked ? ' field__box--locked' : ''}`}>
        <input
          {...rest}
          id={id}
          className="field__input"
          type={isPassword && shown ? 'text' : type}
          readOnly={locked}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? `${id}-note` : undefined}
        />
        {locked && <Lock className="field__icon" aria-hidden="true" />}
        {isPassword && !locked && (
          <button
            type="button"
            className="field__action"
            aria-label={t(shown ? 'auth.hide_password' : 'auth.show_password')}
            aria-pressed={shown}
            disabled={rest.disabled}
            onClick={() => setShown(!shown)}
          >
            {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        )}
      </div>
      {note && (
        <p id={`${id}-note`} className="field__note">
          {error && <CircleAlert className="field__icon" aria-hidden="true" />}
          {note}
        </p>
      )}
    </div>
  );
}
