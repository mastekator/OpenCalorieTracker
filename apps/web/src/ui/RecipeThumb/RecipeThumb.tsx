import { useState } from 'react';
import { matchIllustration, type Recipe } from '@oct/shared';
import { thumbUrl } from '../../data/thumbs';
import { DishIllustration } from '../DishIllustration/DishIllustration';
import './RecipeThumb.css';

/** A recipe's photo, or its illustration when it has none or the photo fails to load. */
export function RecipeThumb({ recipe }: { recipe: Recipe }) {
  // A photo not in the cache offline falls back to the illustration, as in MealRow.
  const [broken, setBroken] = useState(false);
  return recipe.photoId && !broken ? (
    <img
      className="recipe-thumb"
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
  );
}
