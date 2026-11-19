import { nameKey, type Recipe } from '@oct/shared';
import { byLastLogged } from '../../data/DataContext';

/** «My recipes · recent» before typing (OCT-160 3.4). */
const RECENT = 3;

/**
 * Recipes for the manual sheet: with no query the last logged ones, never logged
 * ones left out; with one, names containing it, those starting with it first.
 */
export function matchRecipes(recipes: Recipe[], query: string): Recipe[] {
  const q = nameKey(query);
  if (!q)
    return recipes
      .filter((r) => r.lastLoggedAt)
      .sort(byLastLogged)
      .slice(0, RECENT);
  const starts = (r: Recipe) => Number(nameKey(r.name).startsWith(q));
  return recipes
    .filter((r) => nameKey(r.name).includes(q))
    .sort((a, b) => starts(b) - starts(a) || byLastLogged(a, b));
}

/** The recipe a dish is named like, for «Your recipe»; of several, the last logged (ADR-0023 §6). */
export const recipeFor = (recipes: Recipe[], name: string) => {
  const key = nameKey(name);
  return recipes.filter((r) => nameKey(r.name) === key).sort(byLastLogged)[0];
};
