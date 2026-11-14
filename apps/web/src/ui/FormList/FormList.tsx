import { useId, useState, type ReactNode } from 'react';
import { useT } from '../../i18n';
import '../List/List.css';
import './FormList.css';

/*
 * Form as a grouped list (OCT-22 §1): rows of the existing List with the value
 * edited right in the row. Group them in <List title footer>.
 */

type RowProps = {
  label: ReactNode;
  /** Second line under the label (footnote, secondary). */
  description?: ReactNode;
  /** The field: InlineNumber, InlineDate, HeightFtIn. */
  children: ReactNode;
  /** Label above a full-width control (Segment) instead of label | value. */
  stacked?: boolean;
};

export function FormRow({ label, description, children, stacked }: RowProps) {
  const text = (
    <span className="list-row__label">
      {label}
      {description && (
        <span className="list-row__description">{description}</span>
      )}
    </span>
  );
  return (
    <li className="list__item">
      {stacked ? (
        // A <label> would click the first segment on a tap anywhere in the row.
        <div className="list-row form-row form-row--stacked">
          {text}
          {children}
        </div>
      ) : (
        // A tap anywhere in the row focuses the field, as in iOS settings.
        <label className="list-row form-row">
          {text}
          {children}
        </label>
      )}
    </li>
  );
}

/** Comma or dot as the decimal separator (E-1.3); '' → null. */
export function parseDecimal(text: string): number | null {
  const s = text.replace(',', '.');
  return s === '' || s === '.' ? null : Number(s);
}

type NumberProps = {
  /** Accessible name; the row shows the visible label. */
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  unit?: string;
  /** Digits after the separator when shown; 0 accepts whole numbers only. */
  decimals?: number;
  /** Shown in accent while empty (8.1), e.g. «Add» or «optional». */
  placeholder?: string;
  error?: boolean;
  /** Offline (8.15): plain secondary value, no box. */
  readOnly?: boolean;
};

export function InlineNumber({
  label,
  value,
  onChange,
  unit,
  decimals = 0,
  placeholder,
  error = false,
  readOnly = false,
}: NumberProps) {
  const { t, locale } = useT();
  const unitId = useId();
  // What the user is typing («80,»); null while not focused, then the value is formatted.
  const [typing, setTyping] = useState<string | null>(null);
  const shown =
    typing ??
    (value === null
      ? ''
      : new Intl.NumberFormat(locale, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
          useGrouping: false,
        }).format(value));
  const allowed = decimals ? /^\d*[.,]?\d*$/ : /^\d*$/;
  return (
    <span
      className={`inline-field${error ? ' inline-field--error' : ''}${readOnly ? ' inline-field--ro' : ''}`}
    >
      <input
        className="inline-field__input"
        inputMode={decimals ? 'decimal' : 'numeric'}
        enterKeyHint="done"
        autoComplete="off"
        aria-label={label}
        aria-describedby={unit ? unitId : undefined}
        aria-invalid={error || undefined}
        placeholder={placeholder ?? t('field.empty')}
        size={Math.max(shown.length, 2)}
        value={shown}
        readOnly={readOnly}
        onFocus={() => setTyping(shown)}
        onBlur={() => setTyping(null)}
        onChange={(event) => {
          const next = event.target.value;
          if (!allowed.test(next)) return;
          setTyping(next);
          onChange(parseDecimal(next));
        }}
      />
      {unit && (shown !== '' || typing !== null) && (
        <span id={unitId} className="inline-field__unit">
          {unit}
        </span>
      )}
    </span>
  );
}

type DateProps = {
  label: string;
  /** YYYY-MM-DD */
  value: string | null;
  onChange: (value: string | null) => void;
  /** After the date: «14 Mar 1996 · 30 years». */
  suffix?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  error?: boolean;
  readOnly?: boolean;
};

/** «14 Mar 1996»; without the trailing « г.» Russian adds after the year. */
export function formatDate(date: string, locale: string) {
  const parts = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).formatToParts(new Date(date));
  while (parts.at(-1)?.type === 'literal') parts.pop();
  return parts.map((p) => p.value).join('');
}

/**
 * The formatted date is shown; the native date input lies over it, invisible,
 * so a tap opens the system date picker.
 */
export function InlineDate({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  min,
  max,
  error = false,
  readOnly = false,
}: DateProps) {
  const { t, locale } = useT();
  const text = value
    ? formatDate(value, locale) + (suffix ? ` · ${suffix}` : '')
    : null;
  return (
    <span
      className={`inline-field inline-field--date${error ? ' inline-field--error' : ''}${readOnly ? ' inline-field--ro' : ''}${text ? '' : ' inline-field--empty'}`}
    >
      <span className="inline-field__text" aria-hidden="true">
        {text ?? placeholder ?? t('field.empty')}
      </span>
      <input
        className="inline-field__date"
        type="date"
        aria-label={label}
        aria-invalid={error || undefined}
        value={value ?? ''}
        min={min}
        max={max}
        readOnly={readOnly}
        disabled={readOnly} // a read-only date input still opens the picker
        onClick={(event) => {
          try {
            event.currentTarget.showPicker(); // desktop Chrome: a click alone only focuses
          } catch {
            // No showPicker, or no user activation: the native behaviour stays.
          }
        }}
        onChange={(event) => onChange(event.target.value || null)}
      />
    </span>
  );
}

/** Value of a row that opens a picker (Activity): styled like the fields, accent «Choose» while empty. */
export function PickValue({ value }: { value: string | null }) {
  const { t } = useT();
  return (
    <span className={`inline-field${value ? '' : ' inline-field--empty'}`}>
      <span className="inline-field__text">{value ?? t('field.pick')}</span>
    </span>
  );
}

/** Inches 12 and more are an error (8.19, «inches must be 0 to 11»). */
export const inchesError = (inches: number | null) =>
  inches !== null && inches > 11;

type FtInProps = {
  label: string;
  value: { ft: number | null; in: number | null };
  onChange: (value: { ft: number | null; in: number | null }) => void;
  /** Out of the height range (whole value), shown on both parts. */
  error?: boolean;
  readOnly?: boolean;
};

/** US height (8.19): feet and inches, two whole numbers: 5′ 11″. */
export function HeightFtIn({
  label,
  value,
  onChange,
  error = false,
  readOnly = false,
}: FtInProps) {
  const { t } = useT();
  return (
    <span className="inline-field__pair">
      <InlineNumber
        label={`${label}, ${t('field.feet')}`}
        value={value.ft}
        onChange={(ft) => onChange({ ...value, ft })}
        unit="′"
        error={error}
        readOnly={readOnly}
      />
      {/* Hidden until feet are typed, so an empty height reads «Add» once. */}
      {(value.ft !== null || value.in !== null) && (
        <InlineNumber
          label={`${label}, ${t('field.inches')}`}
          value={value.in}
          onChange={(inches) => onChange({ ...value, in: inches })}
          unit="″"
          error={error || inchesError(value.in)}
          readOnly={readOnly}
        />
      )}
    </span>
  );
}
