import './Switch.css';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name; inside a FormRow the row's label is the visible one. */
  label: string;
  disabled?: boolean;
  id?: string;
};

/** iOS-style on/off switch (OCT-22 §2): `role="switch"` with `aria-checked`. */
export function Switch({ checked, onChange, label, disabled, id }: Props) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}
