import type { Meal, Nutrients, RecipeInput } from '@oct/shared';
import type { RecipeEditorState } from './RecipeEditor';

type Source = Pick<Meal, 'mealType' | 'localDate'> & {
  items: (Nutrients & { name: string; grams: number })[];
};

const cut = (name: string) => name.trim().slice(0, 80);

/**
 * A recipe draft from a meal (AC-6.2, OCT-160 3.6–3.7): dishes become ingredients,
 * the name is the dish with the most kcal; cut to the limits of `recipeInputSchema`.
 */
export function recipeFromMeal(meal: Source): RecipeEditorState {
  const top = meal.items.reduce((a, b) => (b.kcal > a.kcal ? b : a));
  const ingredients: RecipeInput['ingredients'] = meal.items
    .slice(0, 50)
    .map((i) => ({
      name: cut(i.name),
      grams: Math.min(i.grams, 5000),
      kcal: i.kcal,
      proteinG: i.proteinG,
      fatG: i.fatG,
      carbsG: i.carbsG,
      source: 'history',
    }));
  return {
    draft: {
      name: cut(top.name),
      cookedG: null,
      servings: null,
      note: null,
      photoId: null,
      ingredients,
      steps: [],
    },
    fromMeal: { mealType: meal.mealType, localDate: meal.localDate },
  };
}
