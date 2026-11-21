import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  DISH_GRAMS,
  fromProduct,
  scaleItem,
  type MergedDish,
  type Nutrients,
  type Units,
} from '@oct/shared';
import type { BarcodeResult } from '../../data/products';
import { useT } from '../../i18n';
import {
  AltBarcodeHint,
  type AltHintState,
} from '../AltBarcodeHint/AltBarcodeHint';
import { Button } from '../Button/Button';
import { DishSourceBlock } from '../DishSourceBlock/DishSourceBlock';
import type { PackageKind } from '../SourceBadge/SourceBadge';
import { useWeight } from '../weightUnits';
import { Field } from '../Field/Field';
import { Sheet } from '../Sheet/Sheet';
import { WeightStepper } from '../WeightStepper/WeightStepper';
import './DishSheet.css';

/** «Replace» in the sheet: the new code and, when it has a product, the dish from it (AC-3, AC-4). */
export type Replaced = {
  barcode: string;
  dish?: Nutrients & {
    name: string;
    grams: number;
    from: NonNullable<BarcodeResult['from']>;
  };
};

type Props = {
  /** Values every recalculation starts from (AC-3.2); `name` is the current name. */
  original: Nutrients & { name: string; grams: number };
  /** Current weight on the screen. */
  grams: number;
  units: Units;
  /** A package dish: where its numbers come from, and the package's serving if known (OCT-313 2.6). */
  source?: {
    /** `code`: an AI dish with `alt`, only its code shows (OCT-383 3.4). */
    kind: PackageKind | 'code';
    code: string | null;
    servingG?: number | null;
    savedAt?: string;
  };
  /** Another code the AI read on the package (ADR-0036 §5); `lookup` searches it when it has no product. */
  alt?: MergedDish['alt'];
  lookup?: (code: string) => Promise<BarcodeResult>;
  /** «Done» with a non-empty name and a valid weight; `replaced` after «Replace». */
  onDone: (name: string, grams: number, replaced?: Replaced) => void;
  onDelete: () => void;
  /** Close button, Esc, scrim, swipe down: the draft is dropped. */
  onClose: () => void;
};

/** Sheet «Dish» (OCT-16 4.4): rename, weight with live numbers, delete. The screen mounts it while open. */
export function DishSheet({
  original,
  grams: initial,
  units,
  source,
  alt,
  lookup,
  onDone,
  onDelete,
  onClose,
}: Props) {
  const { t, num } = useT();
  const w = useWeight(units);
  const [name, setName] = useState(original.name);
  // An out-of-range AI weight starts invalid, so «Done» can't pass it on as valid (AC-3.4).
  const [grams, setGrams] = useState<number | null>(
    initial >= DISH_GRAMS.min && initial <= DISH_GRAMS.max ? initial : null,
  );
  const [nameErr, setNameErr] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // «Replace» is part of the draft: «Close» drops it (OCT-383 2.2).
  const [replaced, setReplaced] = useState<Replaced>();
  const [hint, setHint] = useState<AltHintState | undefined>(
    alt && {
      kind: 'offer',
      code: alt.code,
      ...(alt.product?.kcal100 != null && {
        product: {
          name: fromProduct(alt.product, alt.product.kcal100, original.name)
            .name,
          kcal100: alt.product.kcal100,
          mine: alt.from === 'mine',
        },
      }),
    },
  );
  const base = replaced?.dish ?? original;
  // A name change never recalculates: the numbers follow the weight only (AC-3.5).
  const shown = scaleItem(base, grams ?? initial);

  const take = (
    code: string,
    r: Pick<BarcodeResult, 'product' | 'from'>,
  ): boolean => {
    if (r.product?.kcal100 == null || !r.from) return false;
    const dish = {
      ...fromProduct(r.product, r.product.kcal100, original.name),
      from: r.from,
    };
    setReplaced({ barcode: code, dish });
    setName(dish.name);
    setNameErr(false);
    setGrams(dish.grams);
    return true;
  };

  const replace = async () => {
    if (!alt || hint?.kind !== 'offer') return;
    const ai = source?.kind === 'code';
    if (take(alt.code, { product: alt.product, from: alt.from ?? null }))
      return setHint({
        kind: 'result',
        result: { product: alt.product, from: alt.from!, off: 'found' },
        ai,
      });
    // No product: only the code changes, then the usual search (AC-4).
    setReplaced({ barcode: alt.code });
    setHint({ kind: 'searching', code: alt.code });
    let r: BarcodeResult;
    try {
      r = lookup
        ? await lookup(alt.code)
        : { product: null, from: null, off: 'down' };
    } catch {
      r = { product: null, from: null, off: 'down' };
    }
    take(alt.code, r);
    setHint({ kind: 'result', result: r, ai });
  };

  const servingG = replaced?.dish ? null : source?.servingG;

  const done = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      // Render the error first, so focusing the field reads it via aria-describedby (WCAG 3.3.1).
      flushSync(() => setNameErr(true));
      return nameRef.current?.focus();
    }
    if (grams !== null) onDone(trimmed, grams, replaced);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('edit.dish.title')}
      footer={
        <>
          <Button onClick={done}>{t('edit.dish.done')}</Button>
          <Button variant="danger-plain" onClick={onDelete}>
            {t('edit.dish.delete')}
          </Button>
        </>
      }
    >
      <div className="dish-sheet">
        <Field
          ref={nameRef}
          label={t('edit.dish.name')}
          value={name}
          hint={t('edit.dish.name_hint')}
          error={nameErr ? t('edit.dish.name_err') : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setNameErr(false);
          }}
        />
        <WeightStepper
          grams={grams}
          units={units}
          label={t('edit.weight.label', { dish: name.trim() || base.name })}
          onChange={setGrams}
        />
        {servingG && (
          <p className="dish-sheet__serving">
            {t('edit.dish.serving', {
              weight: `${w.fmt(servingG)}\u00a0${w.u}`,
            })}
          </p>
        )}
        <p className="dish-sheet__numbers tabular-nums" aria-live="polite">
          <span className="dish-sheet__kcal">
            {t('meal.kcal', { n: num(shown.kcal) })}
          </span>{' '}
          {t('edit.macros', {
            p: num(shown.proteinG),
            f: num(shown.fatG),
            c: num(shown.carbsG),
          })}
        </p>
        {source && (
          <DishSourceBlock
            kind={
              replaced?.dish
                ? replaced.dish.from === 'mine'
                  ? 'mine'
                  : 'barcode'
                : source.kind
            }
            code={replaced?.barcode ?? source.code}
            original={base}
            savedAt={replaced?.dish ? undefined : source.savedAt}
          />
        )}
        {hint && (
          <AltBarcodeHint state={hint} onReplace={() => void replace()} />
        )}
      </div>
    </Sheet>
  );
}
