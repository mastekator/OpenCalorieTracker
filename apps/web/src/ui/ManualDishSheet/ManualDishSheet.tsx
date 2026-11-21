import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ChefHat } from 'lucide-react';
import {
  amountGrams,
  defaultAmount,
  DISH_GRAMS,
  fromPer100,
  kcalFromMacros,
  macrosMismatch,
  normalizeGtin,
  per100,
  round1,
  type DishUnit,
  type Nutrients,
  type Recipe,
  type Units,
} from '@oct/shared';
import { parsePackG, parsePieces } from '../AmountPicker/amount';
import type { Pack } from '../AmountPicker/AmountPicker';
import { matchRecipes } from '../../features/kitchen/matchRecipes';
import type { BarcodeResult } from '../../data/products';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import { Banner } from '../Banner/Banner';
import { BarcodeField, barcodeError } from '../BarcodeField/BarcodeField';
import { Button } from '../Button/Button';
import { Field } from '../Field/Field';
import { parseDecimal } from '../FormList/FormList';
import { List, ListRow } from '../List/List';
import { Segment } from '../Segment/Segment';
import { RecipeThumb } from '../RecipeThumb/RecipeThumb';
import { Sheet } from '../Sheet/Sheet';
import { unitOf, useWeight, weightIn } from '../weightUnits';
import './ManualDishSheet.css';

/**
 * `barcode`: normalized; the server remembers the dish as the user's product (AC-4.5),
 * `unit` as its `per` (ADR-0038 §3).
 */
export type ManualDish = Nutrients & {
  name: string;
  grams: number;
  barcode?: string;
  /** 'ml': `grams` are millilitres (ADR-0038); none: grams, as older records. */
  unit?: DishUnit;
  /** Typed for a code not found: remembered for it like the dish sheet's (ADR-0037 §4). */
  pack?: Pack;
};
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

type Fields =
  | 'barcode'
  | 'name'
  | 'weight'
  | 'packG'
  | 'pieces'
  | 'kcal'
  | 'proteinG'
  | 'fatG'
  | 'carbsG';

type Props = {
  units: Units;
  /** Starting name, e.g. what was typed in the ingredient search. */
  name?: string;
  /** Sheet title; «Add dish manually» by default. */
  title?: string;
  /** «Add» with a valid dish: totals for its weight. */
  onAdd: (dish: ManualDish) => void;
  /** Close button, Esc, scrim, swipe down: the draft is dropped. */
  onClose: () => void;
  /** The user's recipes: recent ones before typing, matches first while typing (OCT-160 3.4). */
  recipes?: Recipe[];
  /** A recipe tapped: the screen opens its portion sheet. */
  onRecipe?: (recipe: Recipe) => void;
  /** Set: the «Barcode» field goes first (OCT-313 §3). */
  lookup?: (code: string) => Promise<BarcodeResult>;
  /** Starting barcode, e.g. read from a photo. */
  barcode?: string;
  /** `barcode` was read from a photo without AI and not found (OCT-313 3.4); who can turn AI on. */
  photoNotFound?: 'admin' | 'user';
};

/** Screen 5 (OCT-16 §4): a dish entered by hand, per 100 g or per serving. The screen mounts it while open. */
export function ManualDishSheet({
  units,
  name: initialName = '',
  title,
  onAdd,
  onClose,
  recipes = [],
  onRecipe,
  lookup,
  barcode: initialBarcode = '',
  photoNotFound,
}: Props) {
  const { t, num } = useT();
  // The switch's choice; a product found by the current barcode sets its own (AC-4).
  const [chosen, setChosen] = useState<DishUnit>('g');
  const [packUnit, setPackUnit] = useState<DishUnit | null>(null);
  const dishUnit = packUnit ?? chosen;
  const w = useWeight(units, dishUnit);
  const { us, ml } = w;
  const [text, setText] = useState<Record<Fields, string>>({
    barcode: initialBarcode,
    name: initialName,
    weight: '',
    kcal: '',
    proteinG: '',
    fatG: '',
    carbsG: '',
    packG: '',
    pieces: '',
  });
  const [basis, setBasis] = useState<Basis>(() =>
    localStorage.getItem(BASIS_KEY) === 'portion' ? 'portion' : 'per100',
  );
  // Errors show after leaving a field or on «Add» (§4).
  const [touched, setTouched] = useState<Partial<Record<Fields, boolean>>>({});
  const refs = useRef<Partial<Record<Fields, HTMLInputElement | null>>>({});
  // The code was looked up and not found: the package fields show (OCT-380 5.2).
  const [notFound, setNotFound] = useState(!!photoNotFound);
  const latest = useRef(text);
  latest.current = text;

  const name = text.name.trim();
  const found = onRecipe ? matchRecipes(recipes, name) : [];
  const weight = parse(text.weight);
  const g = weight === null ? null : w.toG(weight);
  const grams =
    g !== null && g >= DISH_GRAMS.min && g <= DISH_GRAMS.max ? g : null;
  const entered = {
    kcal: parse(text.kcal),
    proteinG: parse(text.proteinG, 0),
    fatG: parse(text.fatG, 0),
    carbsG: parse(text.carbsG, 0),
  };
  const askPack = notFound && !!lookup;
  const packG = text.packG.trim() ? parsePackG(text.packG, w.toG) : null;
  const pieces = text.pieces.trim() ? parsePieces(text.pieces) : null;
  const badCode = barcodeError(text.barcode);
  const errors: Partial<Record<Fields, string>> = {
    ...(badCode && { barcode: t(badCode) }),
    ...(!name && { name: t('edit.dish.name_err') }),
    ...(grams === null && {
      weight: t(
        !text.weight.trim()
          ? ml
            ? 'manual_dish.err.volume_empty'
            : 'manual_dish.err.weight_empty'
          : ml
            ? us
              ? 'edit.weight.err_fl_oz'
              : 'edit.weight.err_ml'
            : us
              ? 'edit.weight.err_oz'
              : 'edit.weight.err_g',
      ),
    }),
    // Optional: an empty field is no error.
    ...(askPack &&
      text.packG.trim() &&
      packG === null && { packG: t('edit.dish.pack.err.weight') }),
    ...(askPack &&
      text.pieces.trim() &&
      pieces === null && { pieces: t('edit.dish.pack.err.pieces') }),
  };
  const values = entered as Nutrients;
  const totals =
    grams === null
      ? null
      : basis === 'per100'
        ? fromPer100(values, grams)
        : values;
  for (const k of ['kcal', 'proteinG', 'fatG', 'carbsG'] as const)
    if (entered[k] === null)
      errors[k] = t(
        k === 'kcal' && !text.kcal.trim()
          ? 'manual_dish.err.kcal_empty'
          : 'manual_dish.err.number',
      );
    // Over the API limits the queued meal would be refused (mealItemInputSchema).
    else if (totals && totals[k] > (k === 'kcal' ? 10000 : 1000))
      errors[k] = t('manual_dish.err.too_big');
  const shown = (k: Fields) => (touched[k] ? errors[k] : undefined);
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
    const code = normalizeGtin(text.barcode);
    onAdd({
      ...(code && { barcode: code }),
      name,
      grams: round1(grams),
      ...unitOf(dishUnit),
      kcal: round1(totals.kcal),
      proteinG: round1(totals.proteinG),
      fatG: round1(totals.fatG),
      carbsG: round1(totals.carbsG),
      ...(code &&
        askPack &&
        (packG || pieces) && {
          pack: { ...(packG && { packG }), ...(pieces && { pieces }) },
        }),
    });
  };

  // Fills only what is still empty, per 100 g; the weight is the package serving (OCT-313 3.2).
  const fillFrom = ({ product }: BarcodeResult) => {
    setNotFound(!product);
    if (!product) return refs.current.name?.focus();
    // The fields as they are now: the user may have typed while the lookup ran.
    const text = latest.current;
    const empty = (k: Fields) => !text[k].trim();
    // Calories typed by hand keep their basis: the macros per 100 g would not match them.
    const per100 = empty('kcal');
    const put = (k: Fields, v: string | number | null) =>
      empty(k) && v !== null && (per100 || k === 'name' || k === 'weight')
        ? String(v)
        : text[k];
    setPackUnit(product.per);
    const g = amountGrams(product, defaultAmount(product));
    setText({
      ...text,
      name: put('name', product.name ?? product.brand),
      weight: put('weight', weightIn(units, product.per).show(g)),
      kcal: put('kcal', product.kcal100),
      proteinG: put('proteinG', product.protein100),
      fatG: put('fatG', product.fat100),
      carbsG: put('carbsG', product.carbs100),
    });
    if (per100) setBasis('per100');
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
      title={title ?? t('manual_dish.title')}
      footer={<Button onClick={add}>{t('manual_dish.add')}</Button>}
    >
      <div className="manual-dish">
        {photoNotFound && (
          <Banner tone="notice">
            {t('manual_dish.barcode.photo_not_found')}
            <br />
            {t(`manual_dish.barcode.ai_for_labels.${photoNotFound}`)}
          </Banner>
        )}
        {lookup && (
          <BarcodeField
            ref={(el) => {
              refs.current.barcode = el;
            }}
            value={text.barcode}
            onChange={(v) => {
              setText((s) => ({ ...s, barcode: v }));
              setNotFound(false);
              // Another code: the switch opens on the unit the amount is in.
              if (packUnit) setChosen(packUnit);
              setPackUnit(null);
            }}
            onBlur={blur('barcode')}
            error={shown('barcode')}
            lookup={lookup}
            onResult={fillFrom}
          />
        )}
        <Field
          {...field('name')}
          label={required(t('manual_dish.name'))}
          maxLength={80}
          placeholder={t('manual_dish.name_ph')}
        />
        {found.length > 0 && (
          <List
            title={t(
              name ? 'manual_dish.recipes' : 'manual_dish.recipes_recent',
            )}
            footer={name ? undefined : t('manual_dish.recipes_footer')}
          >
            {found.map((r) => (
              <ListRow
                key={r.id}
                icon={<RecipeThumb recipe={r} />}
                // Same names differ by kcal per 100 g (OCT-160 3.4); the recent group's title already says «recipes».
                description={
                  <>
                    {name && (
                      <Badge>
                        <ChefHat aria-hidden="true" />
                        {t('manual_dish.recipe')}
                      </Badge>
                    )}{' '}
                    {t('recipes.per100', { k: num(per100(r).kcal) })}
                  </>
                }
                onClick={() => onRecipe?.(r)}
              >
                {r.name}
              </ListRow>
            ))}
          </List>
        )}
        <div
          className={`manual-dish__amount${packUnit ? ' manual-dish__amount--pack' : ''}`}
        >
          <Field
            {...field('weight')}
            label={required(
              t(ml ? 'manual_dish.volume' : 'manual_dish.weight'),
            )}
            inputMode={us ? 'decimal' : 'numeric'}
            // The switch already names g / ml; ounces still need theirs.
            suffix={packUnit || us ? w.u : undefined}
            hint={packUnit ? t('manual_dish.unit_from_pack') : undefined}
          />
          {!packUnit && (
            <Segment
              label={t('manual_dish.unit')}
              options={[
                {
                  value: 'g',
                  label: t('unit.g'),
                  aria: t('manual_dish.grams'),
                },
                {
                  value: 'ml',
                  label: t('unit.ml'),
                  aria: t('manual_dish.milliliters'),
                },
              ]}
              value={chosen}
              onChange={setChosen}
            />
          )}
        </div>
        <div className="manual-dish__basis">
          <span className="manual-dish__label">{t('manual_dish.basis')}</span>
          <Segment
            label={t('manual_dish.basis')}
            options={[
              {
                value: 'per100',
                label: t(ml ? 'manual_dish.per100ml' : 'manual_dish.per100'),
              },
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
              weight: `${text.weight.trim()}\u00a0${w.u}`,
              kcal: num(totals.kcal),
            })}
          </p>
        )}
        {/* Optional, under the required kcal and macros (OCT-380 5.2). */}
        {askPack && (
          <>
            <Field
              {...field('packG')}
              label={t('edit.dish.pack.weight')}
              inputMode={us ? 'decimal' : 'numeric'}
              suffix={w.u}
              hint={t('edit.dish.pack.weight_hint')}
            />
            <Field
              {...field('pieces')}
              label={t('edit.dish.pack.pieces')}
              inputMode="numeric"
              suffix={t('edit.amount.pcs')}
              placeholder={t('edit.dish.pack.pieces_ph')}
            />
          </>
        )}
      </div>
    </Sheet>
  );
}
