import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Pencil } from 'lucide-react';
import {
  matchIllustration,
  type Drink,
  type DrinkInput,
  type IllustrationId,
} from '@oct/shared';
import { useT } from '../../i18n';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import {
  DishIllustration,
  illustrationLabel,
} from '../../ui/DishIllustration/DishIllustration';
import { Field } from '../../ui/Field/Field';
import { parseDecimal } from '../../ui/FormList/FormList';
import { IllustrationPicker } from '../../ui/IllustrationPicker/IllustrationPicker';
import { List, ListRow } from '../../ui/List/List';
import { Sheet } from '../../ui/Sheet/Sheet';
import { Switch } from '../../ui/Switch/Switch';
import './CustomDrinkSheet.css';

/** The picture matched by the name; a name with no match gets the generic drink, not a plate. */
export const drinkIllustration = (name: string): IllustrationId => {
  const id = matchIllustration(name);
  return id === 'plate' ? 'drinks' : id;
};

const NUMBERS = [
  ['kcal', 'kcal', 1000],
  ['proteinG', 'protein', 100],
  ['fatG', 'fat', 100],
  ['carbsG', 'carbs', 100],
] as const;
type Num = (typeof NUMBERS)[number][0];
type Fields = 'name' | Num;

const show = (n: number) => (n ? String(n).replace('.', ',') : '');

type Props = {
  /** Set: «Drink» with its values and «Delete drink»; none: a new one. */
  drink?: Drink;
  online: boolean;
  /** Resolves when saved; a rejection keeps the sheet open with an error. */
  onSave: (input: DrinkInput) => Promise<unknown>;
  onDelete?: () => void;
  onClose: () => void;
};

/** OCT-147 3.4–3.5: the user's own drink, per 100 ml. The screen mounts it while open. */
export function CustomDrinkSheet({
  drink,
  online,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const { t, locale, num } = useT();
  const [text, setText] = useState<Record<Fields, string>>({
    name: drink?.name ?? '',
    kcal: show(drink?.kcal ?? 0),
    proteinG: show(drink?.proteinG ?? 0),
    fatG: show(drink?.fatG ?? 0),
    carbsG: show(drink?.carbsG ?? 0),
  });
  // null: follows the name, as a dish's picture (OCT-33).
  const [picked, setPicked] = useState<IllustrationId | null>(
    drink && drink.illustration !== drinkIllustration(drink.name)
      ? drink.illustration
      : null,
  );
  const [countsWater, setCountsWater] = useState(drink?.countsWater ?? true);
  const [touched, setTouched] = useState<Partial<Record<Fields, boolean>>>({});
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const refs = useRef<Partial<Record<Fields, HTMLInputElement | null>>>({});

  const name = text.name.trim();
  const illustration = picked ?? drinkIllustration(name);
  const values = {} as Record<Num, number>;
  const errors: Partial<Record<Fields, string>> = name
    ? {}
    : { name: t('drink_form.name_err') };
  for (const [k, , max] of NUMBERS) {
    // Empty is 0 (OCT-147 3.4).
    const n = text[k].trim() ? parseDecimal(text[k].trim()) : 0;
    if (n === null || !Number.isFinite(n) || n < 0)
      errors[k] = t('manual_dish.err.number');
    else if (n > max) errors[k] = t('drink_form.err_max', { max: num(max) });
    else values[k] = n;
  }

  const field = (k: Fields) => ({
    ref: (el: HTMLInputElement | null) => {
      refs.current[k] = el;
    },
    value: text[k],
    onChange: (e: { target: { value: string } }) =>
      setText((s) => ({ ...s, [k]: e.target.value })),
    onBlur: () => setTouched((s) => ({ ...s, [k]: true })),
    error: touched[k] ? errors[k] : undefined,
    autoComplete: 'off',
  });

  const save = async () => {
    const first = (Object.keys(text) as Fields[]).find((k) => errors[k]);
    if (first) {
      // Errors render first, so focus reads them via aria-describedby (WCAG 3.3.1).
      flushSync(() =>
        setTouched(Object.fromEntries(Object.keys(text).map((k) => [k, true]))),
      );
      refs.current[first]?.focus();
      return;
    }
    setSaving(true);
    setFailed(false);
    try {
      await onSave({ name, illustration, countsWater, ...values });
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet
        open={!picking}
        onClose={onClose}
        title={t(drink ? 'drink_form.edit' : 'drink_form.new')}
        footer={
          <div className="drink-form__footer">
            {!online && (
              <p className="drink-form__note">{t('drink_form.offline')}</p>
            )}
            <Button
              disabled={!online}
              loading={saving}
              onClick={() => void save()}
            >
              {saving ? t('drink_form.saving') : t('drink_form.save')}
            </Button>
          </div>
        }
      >
        <div className="drink-form">
          {failed && <Banner tone="danger">{t('drink_form.error')}</Banner>}
          <div className="drink-form__head">
            <button
              type="button"
              className="drink-form__illo"
              aria-label={t('edit.illo.change', {
                name: illustrationLabel(illustration, locale),
              })}
              onClick={() => setPicking(true)}
            >
              <DishIllustration id={illustration} />
              <span className="drink-form__illo-dot" aria-hidden="true">
                <Pencil />
              </span>
            </button>
            <Field
              {...field('name')}
              label={t('drink_form.name')}
              maxLength={40}
            />
          </div>
          <h3 className="drink-form__label">{t('drink_form.per100')}</h3>
          <div className="drink-form__numbers">
            {NUMBERS.map(([k, label]) => (
              <Field
                key={k}
                {...field(k)}
                label={t(`manual_dish.${label}`)}
                inputMode="decimal"
                suffix={t(k === 'kcal' ? 'today.kcal' : 'unit.g')}
              />
            ))}
          </div>
          <List footer={t('drink_form.not_water_hint')}>
            <ListRow
              value={
                <Switch
                  checked={!countsWater}
                  onChange={(on) => setCountsWater(!on)}
                  label={t('drink_form.not_water')}
                />
              }
            >
              {t('drink_form.not_water')}
            </ListRow>
          </List>
          {drink && onDelete && (
            <div className="drink-form__delete">
              <Button
                variant="danger-plain"
                disabled={!online}
                onClick={onDelete}
              >
                {t('drink_form.delete')}
              </Button>
              <p className="drink-form__note">{t('drink_form.delete_note')}</p>
            </div>
          )}
        </div>
      </Sheet>
      <IllustrationPicker
        open={picking}
        onClose={() => setPicking(false)}
        name={name}
        current={illustration}
        manual={picked !== null}
        onPick={(id) => {
          setPicked(id);
          setPicking(false);
        }}
        onReset={() => {
          setPicked(null);
          setPicking(false);
        }}
      />
    </>
  );
}
