import { useId } from 'react';
import {
  Barcode,
  CircleAlert,
  Package,
  Scale,
  TriangleAlert,
} from 'lucide-react';
import type { DishUnit, Units } from '@oct/shared';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import { SourceBadge } from '../SourceBadge/SourceBadge';
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
  /** Found by barcode: a «barcode» badge after the name (OCT-435 2.3). */
  barcode?: boolean;
  /** The weight was read from a scale or a package on a photo (OCT-435 3.2): a tag after the name. */
  from?: 'scale' | 'package';
  /** The package share the grams came from, «½ pack · 200 g»; dropped once the grams are edited. */
  share?: string;
  /** A line under the kcal, e.g. «400 g with peel → edible 360 g · 90% · USDA». */
  note?: string;
  /** Why the row needs a look (the AI couldn't estimate it): warning background and this text. */
  unsure?: string;
  /** Past the recipe's 50: tagged «won't fit», left out of «Add the first N» (AC-C2). */
  wontFit?: boolean;
  /** Just added: lit accent-soft for about a second on mount (OCT-435 3.6). */
  highlight?: boolean;
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
  barcode,
  from,
  share,
  note,
  unsure,
  wontFit,
  highlight,
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
        className={`list-row ingredient-row${error ? ' stepper--error' : ''}${unsure ? ' ingredient-row--unsure' : ''}${highlight ? ' ingredient-row--new' : ''}`}
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
            {from && (
              <>
                {' '}
                <Badge tone="ok">
                  {from === 'scale' ? (
                    <Scale aria-hidden="true" />
                  ) : (
                    <Package aria-hidden="true" />
                  )}
                  {t(`editor.products.from_${from}`)}
                </Badge>
              </>
            )}
            {barcode && (
              <>
                {' '}
                <SourceBadge kind="barcode" />
              </>
            )}
            {wontFit && (
              <>
                {' '}
                <Badge tone="warn">{t('editor.products.wont_fit')}</Badge>
              </>
            )}
          </span>
          <span className="ingredient-row__kcal">
            {zero ? t('recipe.zero_kcal') : t('meal.kcal', { n: num(kcal) })}
          </span>
          {share && (
            <span className="ingredient-row__kcal ingredient-row__share">
              <Barcode aria-hidden="true" />
              {share}
            </span>
          )}
          {note && (
            <span className="ingredient-row__kcal tabular-nums">{note}</span>
          )}
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
