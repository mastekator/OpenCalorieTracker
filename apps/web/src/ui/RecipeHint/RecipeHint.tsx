import { matchIllustration, per100, type Recipe } from '@oct/shared';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { DishIllustration } from '../DishIllustration/DishIllustration';
import '../HistoryHint/HistoryHint.css';

type Props = {
  recipe: Recipe;
  /** «Use the recipe»: its kcal and macros per 100 g for the dish's weight. */
  onApply: () => void;
  /** «Keep estimate»: hide the hint. */
  onKeep: () => void;
};

/** «Your recipe: Pilaf · 166 kcal/100 g» under a dish named like a recipe (OCT-160 3.6); HistoryHint's look. */
export function RecipeHint({ recipe, onApply, onKeep }: Props) {
  const { t, num } = useT();
  return (
    <div className="history-hint">
      <p className="history-hint__text tabular-nums">
        <DishIllustration
          id={matchIllustration(recipe.name)}
          size="var(--hint-illo-size)"
        />
        {t('edit.recipe.hint', {
          name: recipe.name,
          k: num(per100(recipe).kcal),
        })}
      </p>
      <div className="history-hint__actions">
        <Button variant="plain" small onClick={onApply}>
          {t('edit.recipe.apply')}
        </Button>
        <span className="history-hint__keep">
          <Button variant="plain" small onClick={onKeep}>
            {t('edit.history.keep')}
          </Button>
        </span>
      </div>
    </div>
  );
}
