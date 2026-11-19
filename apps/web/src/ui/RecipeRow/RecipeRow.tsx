import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'wouter';
import {
  matchIllustration,
  per100,
  servingG,
  fromPer100,
  type Recipe,
} from '@oct/shared';
import { thumbUrl } from '../../data/thumbs';
import { useT } from '../../i18n';
import { DishIllustration } from '../DishIllustration/DishIllustration';
import './RecipeRow.css';

type Props = { recipe: Recipe; href: string };

/** A recipe in the kitchen list (OCT-160 1.2): photo or illustration, kcal per 100 g and per serving. */
export function RecipeRow({ recipe, href }: Props) {
  const { t, num } = useT();
  // A photo not in the cache offline falls back to the illustration, as in MealRow.
  const [broken, setBroken] = useState(false);
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
        {recipe.photoId && !broken ? (
          <img
            className="recipe-row__photo"
            src={thumbUrl(recipe.photoId)}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <DishIllustration
            id={matchIllustration(recipe.name)}
            size="var(--thumb-size)"
          />
        )}
        <span className="recipe-row__main">
          <span className="recipe-row__name">{recipe.name}</span>
          <span className="recipe-row__kcal">{kcal}</span>
        </span>
        <ChevronRight className="list-row__chevron" aria-hidden="true" />
      </Link>
    </li>
  );
}
