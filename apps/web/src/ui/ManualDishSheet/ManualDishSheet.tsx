import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  DISH_GRAMS,
  fromPer100,
  kcalFromMacros,
  macrosMismatch,
  ozToG,
  round1,
  type Nutrients,
  type Units,
} from '@oct/shared';
import { useT } from '../../i18n';
import { Banner } from '../Banner/Banner';
import { Button } from '../Button/Button';
import { Field } from '../Field/Field';
import { parseDecimal } from '../FormList/FormList';
import { Segment } from '../Segment/Segment';
import { Sheet } from '../Sheet/Sheet';
import './ManualDishSheet.css';

export type ManualDish = Nutrients & { name: string; grams: number };
type Basis = 'per100' | 'portion';

/** Last «Per 100 g / Per serving» choice on this device (OCT-16 §4). */
export const BASIS_KEY = 'oct.manualBasis';
/** Above this share kcal and macros disagree: a soft warning (AC-5.4). */
const MISMATCH = 0.3;

/** Comma or dot; '' → 0 for the macros (empty = 0), null when not a number ≥ 0. */
const parse = (text: string, empty: number | null = null) => {
  const n = parseDecimal(text.trim());
  if (n === null) return empty;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

type Fields = 'name' | 'weight' | 'kcal' | 'proteinG' | 'fatG' | 'carbsG';

type Props = {
  units: Units;
  /** «Add» with a valid dish: totals for its weight. */
  onAdd: (dish: ManualDish) => void;
  /** Close button, Esc, scrim, swipe down: the draft is dropped. */
  onClose: () => void;
};

/** Screen 5 (OCT-16 §4): a dish entered by hand, per 100 g or per serving. The screen mounts it while open. */
export function ManualDishSheet({ units, onAdd, onClose }: Props) {
  const { t, num } = useT();
  const us = units === 'us';
  const unit = t(us ? 'unit.oz' : 'unit.g');
  const [text, setText] = useState<Record<Fields, string>>({
    name: '',
    weight: '',
    kcal: '',
    proteinG: '',
    fatG: '',
    carbsG: '',
  });
  const [basis, setBasis] = useState<Basis>(() =>
    localStorage.getItem(BASIS_KEY) === 'portion' ? 'portion' : 'per100',
  );
  // Errors show after leaving a field or on «Add» (§4).
  const [touched, setTouched] = useState<Partial<Record<Fields, boolean>>>({});
  const refs = useRef<Partial<Record<Fields, HTMLInputElement | null>>>({});

  const name = text.name.trim();
  const weight = parse(text.weight);
  const g = weight === null ? null : us ? ozToG(weight) : weight;
  const grams =
    g !== null && g >= DISH_GRAMS.min && g <= DISH_GRAMS.max ? g : null;
  const entered = {
    kcal: parse(text.kcal),
    proteinG: parse(text.proteinG, 0),
    fatG: parse(text.fatG, 0),
    carbsG: parse(text.carbsG, 0),
  };
  const errors: Partial<Record<Fields, string>> = {
    ...(!name && { name: t('edit.dish.name_err') }),
    ...(grams === null && { weight: t('edit.weight.err') }),
  };
  for (const k of ['kcal', 'proteinG', 'fatG', 'carbsG'] as const)
    if (entered[k] === null) errors[k] = t('manual_dish.err.number');
  const shown = (k: Fields) => (touched[k] ? errors[k] : undefined);

  const values = entered as Nutrients;
  // shortcut: totals above the API limits (10000 kcal, 1000 g macros) are not checked here; add if users hit it.
  const totals =
    grams === null
      ? null
      : basis === 'per100'
        ? fromPer100(values, grams)
        : values;
  // Only with macros entered: kcal alone is not a mismatch.
  const anyMacro = !!(
    text.proteinG.trim() ||
    text.fatG.trim() ||
    text.carbsG.trim()
  );
  const mismatch =
    anyMacro &&
    Object.values(entered).every((v) => v !== null) &&
    macrosMismatch(values.kcal, values.proteinG, values.fatG, values.carbsG) >
      MISMATCH;

  const set = (k: Fields) => (e: { target: { value: string } }) =>
    setText((s) => ({ ...s, [k]: e.target.value }));
  const blur = (k: Fields) => () => setTouched((s) => ({ ...s, [k]: true }));

  const add = () => {
    const first = (Object.keys(text) as Fields[]).find((k) => errors[k]);
    if (first || !totals || grams === null) {
      // Render the errors first, so focusing reads them via aria-describedby (WCAG 3.3.1).
      flushSync(() =>
        setTouched(Object.fromEntries(Object.keys(text).map((k) => [k, true]))),
      );
      if (first) refs.current[first]?.focus();
      return;
    }
    localStorage.setItem(BASIS_KEY, basis);
    onAdd({
      name,
      grams: round1(grams),
      kcal: round1(totals.kcal),
      proteinG: round1(totals.proteinG),
      fatG: round1(totals.fatG),
      carbsG: round1(totals.carbsG),
    });
  };

  const required = (label: string) => `${label} · ${t('manual_dish.required')}`;
  const field = (k: Fields) => ({
    ref: (el: HTMLInputElement | null) => {
      refs.current[k] = el;
    },
    value: text[k],
    onChange: set(k),
    onBlur: blur(k),
    error: shown(k),
    autoComplete: 'off',
  });

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('manual_dish.title')}
      footer={<Button onClick={add}>{t('manual_dish.add')}</Button>}
    >
      <div className="manual-dish">
        <Field
          {...field('name')}
          label={required(t('manual_dish.name'))}
          placeholder={t('manual_dish.name_ph')}
        />
        <Field
          {...field('weight')}
          label={required(t('manual_dish.weight'))}
          inputMode={us ? 'decimal' : 'numeric'}
          suffix={unit}
        />
        <div className="manual-dish__basis">
          <span className="manual-dish__label">{t('manual_dish.basis')}</span>
          <Segment
            label={t('manual_dish.basis')}
            options={[
              { value: 'per100', label: t('manual_dish.per100') },
              { value: 'portion', label: t('manual_dish.perPortion') },
            ]}
            value={basis}
            onChange={setBasis}
          />
        </div>
        <Field
          {...field('kcal')}
          label={required(t('manual_dish.kcal'))}
          inputMode="decimal"
        />
        {mismatch && (
          <Banner tone="warning">
            {t('manual_dish.warn.mismatch', {
              n: num(
                kcalFromMacros(values.proteinG, values.fatG, values.carbsG),
              ),
            })}
          </Banner>
        )}
        <div className="manual-dish__macros">
          {(
            [
              ['proteinG', 'protein'],
              ['fatG', 'fat'],
              ['carbsG', 'carbs'],
            ] as const
          ).map(([k, label]) => (
            <Field
              key={k}
              {...field(k)}
              label={t(`manual_dish.${label}`)}
              inputMode="decimal"
              suffix={t('unit.g')}
            />
          ))}
        </div>
        {basis === 'per100' && totals && entered.kcal !== null && (
          <p className="manual-dish__total tabular-nums" aria-live="polite">
            {t('manual_dish.total', {
              weight: `${text.weight.trim()} ${unit}`,
              kcal: num(totals.kcal),
            })}
          </p>
        )}
      </div>
    </Sheet>
  );
}
