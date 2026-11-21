import { useRef, useState, type Ref } from 'react';
import { Barcode } from 'lucide-react';
import { normalizeGtin } from '@oct/shared';
import type { BarcodeResult } from '../../data/products';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/translate';
import { Banner } from '../Banner/Banner';
import { Button } from '../Button/Button';
import { Field } from '../Field/Field';
import './BarcodeField.css';

/** The error for a typed barcode, none when empty or valid (OCT-313 §3). */
export function barcodeError(text: string): Key | undefined {
  if (!text.trim() || normalizeGtin(text)) return undefined;
  const digits = text.replace(/[\s-]/g, '');
  return /^\d{8,14}$/.test(digits)
    ? 'errors.barcode_invalid'
    : 'manual_dish.barcode.err';
}

/** Why a lookup gave no product; none when it found one. Shared with `AltBarcodeHint`. */
export function missingNote(r: BarcodeResult) {
  if (r.product) return undefined;
  return r.off === 'offline'
    ? 'offline'
    : r.off === 'down'
      ? 'off_down'
      : r.off === 'disabled'
        ? 'off_disabled'
        : r.off === 'blocked'
          ? 'off_blocked'
          : 'not_found';
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Error from the form (on «Add»); a «Find» with a wrong code shows it too. */
  error?: string;
  /** Own products → cache → Open Food Facts; offline, this device only. */
  lookup: (code: string) => Promise<BarcodeResult>;
  /** A lookup answered; `product` null: not found. */
  onResult: (result: BarcodeResult) => void;
  ref?: Ref<HTMLInputElement>;
};

/** OCT-313 §3: «Barcode» with «Find» inside (Enter = «Find»); reused by supplements. */
export function BarcodeField({
  value,
  onChange,
  onBlur,
  error,
  lookup,
  onResult,
  ref,
}: Props) {
  const { t } = useT();
  const [searching, setSearching] = useState(false);
  const [wrong, setWrong] = useState(false);
  // Shown while the field still holds the code it answers.
  const [answer, setAnswer] = useState<{ code: string; r: BarcodeResult }>();
  const asked = useRef('');
  const code = normalizeGtin(value);
  const result = answer && answer.code === code ? answer.r : undefined;
  const own = barcodeError(value);

  const find = async () => {
    if (!code) return setWrong(true);
    asked.current = code;
    setSearching(true);
    let r: BarcodeResult;
    try {
      r = await lookup(code);
    } catch {
      r = { product: null, from: null, off: 'down' };
    }
    // Typed on meanwhile: this answer is for another code.
    if (asked.current !== code) return;
    setSearching(false);
    setAnswer({ code, r });
    onResult(r);
  };

  const note = result && missingNote(result);
  const missing: Key | undefined = note && `manual_dish.barcode.${note}`;

  return (
    <div className="barcode-field">
      <Field
        ref={ref}
        label={t('manual_dish.barcode.label')}
        placeholder={t('manual_dish.barcode.ph')}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          setWrong(false);
          asked.current = '';
          setSearching(false);
          onChange(e.target.value);
        }}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (!searching) void find();
        }}
        error={error ?? (wrong && own ? t(own) : undefined)}
        hint={result ? undefined : t('manual_dish.barcode.hint')}
        action={
          <Button
            variant="tonal"
            small
            loading={searching}
            onClick={() => void find()}
          >
            {t(
              searching
                ? 'manual_dish.barcode.searching'
                : 'manual_dish.barcode.find',
            )}
          </Button>
        }
      />
      {result?.product && result.from && (
        <Banner tone="accent" icon={<Barcode aria-hidden="true" />}>
          {t(`manual_dish.barcode.found.${result.from}`)}
        </Banner>
      )}
      {missing && (
        <p
          className={`barcode-field__note${result?.off === 'down' ? ' barcode-field__note--warning' : ''}`}
          role="status"
        >
          {t(missing)}
        </p>
      )}
    </div>
  );
}
