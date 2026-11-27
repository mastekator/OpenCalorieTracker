import { useState } from 'react';
import {
  DRINK_ML,
  entryFrom,
  ML_PER_FL_OZ,
  mlToFlOz,
  type Units,
} from '@oct/shared';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { Field } from '../../ui/Field/Field';
import { parseDecimal } from '../../ui/FormList/FormList';
import { Sheet } from '../../ui/Sheet/Sheet';
import { useVolume } from './format';
import type { DrinkTileInfo } from './WaterCard';
import './AmountSheet.css';

/**
 * Whole ml for the typed amount in the user's units; undefined when empty, null out of
 * range. fl oz is checked against the bounds as shown (0.3–67.6), then clamped in ml.
 */
export function amountMl(
  text: string,
  units: Units,
  bounds: { min: number; max: number } = DRINK_ML,
) {
  const v = parseDecimal(text.trim());
  if (v === null) return undefined;
  const us = units === 'us';
  const min = us ? mlToFlOz(bounds.min) : bounds.min;
  const max = us ? mlToFlOz(bounds.max) : bounds.max;
  if (!(v >= min && v <= max)) return null;
  const ml = Math.round(us ? v * ML_PER_FL_OZ : v);
  return Math.min(bounds.max, Math.max(bounds.min, ml));
}

type Props = {
  /** The drink from the menu; null keeps the sheet closed. */
  drink: DrinkTileInfo | null;
  units: Units;
  onClose: () => void;
  onAdd: (ml: number) => void;
};

/** OCT-147 2.1–2.2: «Other amount» of a drink, with its kcal and macros before logging. */
export function AmountSheet({ drink, units, onClose, onAdd }: Props) {
  const { t, num } = useT();
  const volume = useVolume(units);
  const [text, setText] = useState('');
  const ml = amountMl(text, units);
  const close = () => {
    setText('');
    onClose();
  };
  const range = t('water.range', {
    min: volume(DRINK_ML.min),
    max: volume(DRINK_ML.max),
  });
  const snap = drink && ml ? entryFrom(drink, ml) : null;
  const add = () => {
    if (!ml) return;
    close();
    onAdd(ml);
  };

  return (
    <Sheet
      open={drink !== null}
      onClose={close}
      title={t('water.amount')}
      footer={
        <Button disabled={!ml} onClick={add}>
          {t('water.add')}
        </Button>
      }
    >
      {drink && (
        <form
          className="amount-sheet"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <p className="amount-sheet__per">
            {t('water.per100', {
              name: drink.name,
              kcal: num(drink.per100.kcal),
            })}
          </p>
          <Field
            label={t('water.amount_label')}
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            data-autofocus
            suffix={t(units === 'us' ? 'unit.fl_oz' : 'unit.ml')}
            value={text}
            onChange={(event) => setText(event.target.value)}
            hint={ml === null ? undefined : range}
            error={ml === null ? range : undefined}
          />
          {snap && (
            <div className="amount-sheet__result">
              <span className="amount-sheet__line">
                <span>{drink.name}</span>
                <b>{t('meal.kcal', { n: num(Math.round(snap.kcal)) })}</b>
              </span>
              <span className="amount-sheet__macros">
                {t('water.macros', {
                  p: num(Math.round(snap.proteinG)),
                  f: num(Math.round(snap.fatG)),
                  c: num(Math.round(snap.carbsG)),
                })}
              </span>
            </div>
          )}
        </form>
      )}
    </Sheet>
  );
}
