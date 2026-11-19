import type { Recipe } from '@oct/shared';
import { useRecipes } from '../../data/DataContext';
import { useT } from '../../i18n';
import { DishIllustration } from '../../ui/DishIllustration/DishIllustration';
import { List } from '../../ui/List/List';
import { RecipeRow } from '../../ui/RecipeRow/RecipeRow';
import { ScreenState } from '../../ui/ScreenState/ScreenState';

/** /kitchen: recipes from the local copy, works offline (ADR-0023 §4). */
export function KitchenScreen() {
  return <KitchenView recipes={useRecipes()} />;
}

/**
 * The recipe list (OCT-160 1.2, 1.4), recently logged first. Wave 1: no fridge, no filter;
 * «+» and «New recipe» come with the editor (OCT-308).
 */
export function KitchenView({ recipes }: { recipes: Recipe[] | undefined }) {
  const { t } = useT();
  if (!recipes) return null;
  if (!recipes.length)
    return (
      <ScreenState
        icon={
          <DishIllustration
            id="soup"
            size="calc(var(--space-12) + var(--space-2))"
          />
        }
        title={t('recipes.empty.title')}
      >
        {t('recipes.empty.body')}
      </ScreenState>
    );
  return (
    <List footer={t('recipes.sort_note')}>
      {recipes.map((r) => (
        <RecipeRow key={r.id} recipe={r} href={`/kitchen/${r.id}`} />
      ))}
    </List>
  );
}
