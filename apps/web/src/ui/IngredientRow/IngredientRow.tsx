import { useId } from 'react';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import type { DishUnit, Units } from '@oct/shared';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import '../WeightStepper/WeightStepper.css';
import { useWeight } from '../weightUnits';
import './IngredientRow.css';

type Props = {
  name: string;
  /** Kcal for the current grams; with 0 g «not counted in kcal». */
  kcal: number;
  /** The weight field's text, as typed. */
  grams: string;
  /** The field is in grams or ounces. */
  units?: Units;
  /** 'ml': the field is in ml or fl oz (ADR-0038). */
  unit?: DishUnit;
  /** Under the field; also marks it invalid. */
  error?: string;
  /** Grams estimated by the AI: an «estimate» badge after the name (OCT-160 §9). */
  estimate?: boolean;
  /** Why the row needs a look (the AI couldn't estimate it): warning background and this text. */
  unsure?: string;
  onGramsChange: (text: string) => void;
  /** Tap on the name: the ingredient sheet (rename, weight, delete). */
  onEdit: () => void;
};

/** One ingredient in the recipe editor (OCT-160 2.3): name and kcal, grams field on the right. */
export function IngredientRow({
  name,
  kcal,
  grams,
  units = 'metric',
  unit = 'g',
  error,
  estimate,
  unsure,
  onGramsChange,
  onEdit,
}: Props) {
  const { t, num } = useT();
  const w = useWeight(units, unit);
  const errorId = useId();
  const zero = grams.trim() !== '' && Number(grams.replace(',', '.')) === 0;
  return (
    <li className="list__item">
      <div
        className={`list-row ingredient-row${error ? ' stepper--error' : ''}${unsure ? ' ingredient-row--unsure' : ''}`}
      >
        <button type="button" className="ingredient-row__main" onClick={onEdit}>
          <span className="ingredient-row__name">
            {name}
            {estimate && (
              <>
                {' '}
                <Badge>{t('editor.ai.estimate')}</Badge>
              </>
            )}
          </span>
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
            aria-label={t(
              unit === 'ml'
                ? 'editor.volume'
                : units === 'us'
                  ? 'editor.ounces'
                  : 'editor.grams',
              { name, u: w.u },
            )}
            aria-invalid={!!error}
            aria-describedby={error || unsure ? errorId : undefined}
            onChange={(e) => onGramsChange(e.target.value)}
          />
          <span className="stepper__unit" aria-hidden="true">
            {w.u}
          </span>
        </label>
        {!error && unsure && (
          <p id={errorId} className="ingredient-row__unsure">
            <TriangleAlert aria-hidden="true" />
            {unsure}
          </p>
        )}
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
