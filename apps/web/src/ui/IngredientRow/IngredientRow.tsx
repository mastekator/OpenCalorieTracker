import { useId } from 'react';
import { CircleAlert } from 'lucide-react';
import { useT } from '../../i18n';
import '../WeightStepper/WeightStepper.css';
import './IngredientRow.css';

type Props = {
  name: string;
  /** Kcal for the current grams; with 0 g «not counted in kcal». */
  kcal: number;
  /** The grams field's text, as typed. */
  grams: string;
  /** Under the field; also marks it invalid. */
  error?: string;
  onGramsChange: (text: string) => void;
  /** Tap on the name: the ingredient sheet (rename, weight, delete). */
  onEdit: () => void;
};

/** One ingredient in the recipe editor (OCT-160 2.3): name and kcal, grams field on the right. */
export function IngredientRow({
  name,
  kcal,
  grams,
  error,
  onGramsChange,
  onEdit,
}: Props) {
  const { t, num } = useT();
  const errorId = useId();
  const zero = grams.trim() !== '' && Number(grams.replace(',', '.')) === 0;
  return (
    <li className="list__item">
      <div
        className={`list-row ingredient-row${error ? ' stepper--error' : ''}`}
      >
        <button type="button" className="ingredient-row__main" onClick={onEdit}>
          <span className="ingredient-row__name">{name}</span>
          <span className="ingredient-row__kcal">
            {zero ? t('recipe.zero_kcal') : t('meal.kcal', { n: num(kcal) })}
          </span>
        </button>
        <label className="stepper__box ingredient-row__grams">
          <input
            className="stepper__input tabular-nums"
            inputMode="decimal"
            autoComplete="off"
            value={grams}
            aria-label={t('editor.grams', { name })}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => onGramsChange(e.target.value)}
          />
          <span className="stepper__unit" aria-hidden="true">
            {t('unit.g')}
          </span>
        </label>
        {error && (
          <p id={errorId} className="stepper__error ingredient-row__error">
            <CircleAlert aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
