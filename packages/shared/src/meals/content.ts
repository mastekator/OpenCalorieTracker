import type { Meal, MealPatch } from '../meals.js';

/** What a user edit can change; ids, totals, illustrations and `recalcOffer` are left out (ADR-0022 §2). */
export type MealContent = Pick<
  Meal,
  'mealType' | 'eatenAt' | 'tzOffsetMin' | 'localDate'
> & {
  photo: { id: string } | null;
  items: Pick<
    Meal['items'][number],
    'name' | 'grams' | 'unit' | 'kcal' | 'proteinG' | 'fatG' | 'carbsG'
  >[];
};

/** The meal as `patch` would leave it, with the same fields the server writes in `PATCH`. */
export function applyMealPatch(
  meal: MealContent,
  patch: MealPatch,
): MealContent {
  return {
    mealType: patch.mealType ?? meal.mealType,
    eatenAt: 'eatenAt' in patch ? patch.eatenAt : meal.eatenAt,
    tzOffsetMin: 'eatenAt' in patch ? patch.tzOffsetMin : meal.tzOffsetMin,
    localDate: 'eatenAt' in patch ? patch.localDate : meal.localDate,
    photo: patch.photoId !== undefined ? { id: patch.photoId } : meal.photo,
    items: patch.items
      ? patch.items.map((i) => ({ ...i, unit: i.unit ?? 'g' }))
      : meal.items,
  };
}

/** Same type, time, photo and dishes in order: a repeat of an applied edit, not a conflict. */
export function sameMealContent(a: MealContent, b: MealContent): boolean {
  return (
    a.mealType === b.mealType &&
    Date.parse(a.eatenAt) === Date.parse(b.eatenAt) &&
    a.tzOffsetMin === b.tzOffsetMin &&
    a.localDate === b.localDate &&
    (a.photo?.id ?? null) === (b.photo?.id ?? null) &&
    a.items.length === b.items.length &&
    a.items.every((x, i) => {
      const y = b.items[i]!;
      return (
        x.name === y.name &&
        x.grams === y.grams &&
        x.unit === y.unit &&
        x.kcal === y.kcal &&
        x.proteinG === y.proteinG &&
        x.fatG === y.fatG &&
        x.carbsG === y.carbsG
      );
    })
  );
}
