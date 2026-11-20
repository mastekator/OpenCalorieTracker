import { ChevronRight } from 'lucide-react';
import { Link } from 'wouter';
import { per100, servingG, fromPer100, type Recipe } from '@oct/shared';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import { RecipeThumb } from '../RecipeThumb/RecipeThumb';
import './RecipeRow.css';

type Props = { recipe: Recipe; href: string };

/** A recipe in the kitchen list (OCT-160 1.2): photo or illustration, kcal per 100 g and per serving. */
export function RecipeRow({ recipe, href }: Props) {
  const { t, num } = useT();
  const p100 = per100(recipe);
  const serving = servingG(recipe);
  const kcal = [
    t('recipes.per100', { k: num(p100.kcal) }),
    serving !== null &&
      t('recipes.perPortion', { k: num(fromPer100(p100, serving).kcal) }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="list__item">
      <Link href={href} className="list-row list-row--interactive">
        <RecipeThumb recipe={recipe} />
        <span className="recipe-row__main">
          <span className="recipe-row__name">{recipe.name}</span>
          <span className="recipe-row__kcal">{kcal}</span>
          {recipe.per100 && (
            <span>
              <Badge>{t('recipes.no_ingredients')}</Badge>
            </span>
          )}
        </span>
        <ChevronRight className="list-row__chevron" aria-hidden="true" />
      </Link>
    </li>
  );
}
