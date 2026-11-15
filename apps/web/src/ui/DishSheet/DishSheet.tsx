import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { DISH_GRAMS, scaleItem, type Nutrients, type Units } from '@oct/shared';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { Field } from '../Field/Field';
import { Sheet } from '../Sheet/Sheet';
import { WeightStepper } from '../WeightStepper/WeightStepper';
import './DishSheet.css';

type Props = {
  /** Values every recalculation starts from (AC-3.2); `name` is the current name. */
  original: Nutrients & { name: string; grams: number };
  /** Current weight on the screen. */
  grams: number;
  units: Units;
  /** «Done» with a non-empty name and a valid weight. */
  onDone: (name: string, grams: number) => void;
  onDelete: () => void;
  /** Close button, Esc, scrim, swipe down: the draft is dropped. */
  onClose: () => void;
};

/** Sheet «Dish» (OCT-16 4.4): rename, weight with live numbers, delete. The screen mounts it while open. */
export function DishSheet({
  original,
  grams: initial,
  units,
  onDone,
  onDelete,
  onClose,
}: Props) {
  const { t, num } = useT();
  const [name, setName] = useState(original.name);
  // An out-of-range AI weight starts invalid, so «Done» can't pass it on as valid (AC-3.4).
  const [grams, setGrams] = useState<number | null>(
    initial >= DISH_GRAMS.min && initial <= DISH_GRAMS.max ? initial : null,
  );
  const [nameErr, setNameErr] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // A name change never recalculates: the numbers follow the weight only (AC-3.5).
  const shown = scaleItem(original, grams ?? initial);

  const done = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      // Render the error first, so focusing the field reads it via aria-describedby (WCAG 3.3.1).
      flushSync(() => setNameErr(true));
      return nameRef.current?.focus();
    }
    if (grams !== null) onDone(trimmed, grams);
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
          label={t('edit.weight.label', { dish: name.trim() || original.name })}
          onChange={setGrams}
        />
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
      </div>
    </Sheet>
  );
}
