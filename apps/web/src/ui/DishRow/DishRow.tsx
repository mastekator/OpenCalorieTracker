import { Pencil } from 'lucide-react';
import type { DishSource, Nutrients, Units } from '@oct/shared';
import { useT } from '../../i18n';
import { ConfidenceBadge } from '../ConfidenceBadge/ConfidenceBadge';
import { WeightStepper } from '../WeightStepper/WeightStepper';
import './DishRow.css';

export type DishRowDish = Nutrients & {
  name: string;
  /** Null while the weight field is invalid; the numbers stay as last valid. */
  grams: number | null;
  source: DishSource;
  /** AI only; dropped by the screen after a weight or name edit (AC-2.9). */
  confidence?: number;
};

type Props = {
  dish: DishRowDish;
  units: Units;
  onGramsChange: (grams: number | null) => void;
  /** Opens the «Dish» sheet: rename, weight, delete (OCT-16 4.4). */
  onEdit: () => void;
};

/** One dish on the edit screen: name and kcal, source badge and macros, weight stepper. */
export function DishRow({ dish, units, onGramsChange, onEdit }: Props) {
  const { t, num } = useT();
  return (
    <div className="dish-row">
      <div className="dish-row__head">
        <button
          type="button"
          className="dish-row__name"
          tabIndex={-1} // the pencil is the keyboard and screen reader path
          onClick={onEdit}
        >
          {dish.name}
        </button>
        <span className="dish-row__kcal tabular-nums">
          {t('meal.kcal', { n: num(dish.kcal) })}
        </span>
      </div>
      <div className="dish-row__meta">
        <ConfidenceBadge source={dish.source} confidence={dish.confidence} />
        <span className="tabular-nums">
          {t('edit.macros', {
            p: num(dish.proteinG),
            f: num(dish.fatG),
            c: num(dish.carbsG),
          })}
        </span>
      </div>
      <div className="dish-row__weight">
        <WeightStepper
          grams={dish.grams}
          units={units}
          label={t('edit.weight.label', { dish: dish.name })}
          onChange={onGramsChange}
        />
        <button
          type="button"
          className="dish-row__edit"
          aria-label={t('edit.edit', { dish: dish.name })}
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
