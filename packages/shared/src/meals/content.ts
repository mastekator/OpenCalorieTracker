import { nameKey, type Meal, type MealPatch } from '../meals.js';

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
    a.items.every((x, i) => sameDish(x, b.items[i]!))
  );
}

type Dish = MealContent['items'][number];

const sameDish = (x: Dish, y: Dish) =>
  x.name === y.name &&
  x.grams === y.grams &&
  x.unit === y.unit &&
  x.kcal === y.kcal &&
  x.proteinG === y.proteinG &&
  x.fatG === y.fatG &&
  x.carbsG === y.carbsG;

/** One dish of two versions: null on a side that lacks it (added or removed). */
export type DishDiff<D extends Dish = Dish> = {
  mine: D | null;
  theirs: D | null;
  changed: boolean;
};

/**
 * Two versions of a meal for the conflict screen (ADR-0022 §4): which fields differ, and the dishes
 * paired by `nameKey`, repeated names in order. Mine come in their order, then the dishes only theirs have.
 */
export function diffMeals<M extends MealContent>(mine: M, theirs: M) {
  type D = M['items'][number];
  const fields = (['mealType', 'eatenAt', 'photo'] as const).filter((f) =>
    f === 'mealType'
      ? mine.mealType !== theirs.mealType
      : f === 'eatenAt'
        ? Date.parse(mine.eatenAt) !== Date.parse(theirs.eatenAt) ||
          mine.tzOffsetMin !== theirs.tzOffsetMin ||
          mine.localDate !== theirs.localDate
        : (mine.photo?.id ?? null) !== (theirs.photo?.id ?? null),
  );
  const left: D[] = [...theirs.items];
  const dishes: DishDiff<D>[] = mine.items.map((m: D) => {
    const i = left.findIndex((t) => nameKey(t.name) === nameKey(m.name));
    const t = i < 0 ? null : left.splice(i, 1)[0]!;
    return { mine: m, theirs: t, changed: !t || !sameDish(m, t) };
  });
  for (const t of left) dishes.push({ mine: null, theirs: t, changed: true });
  return { fields, dishes };
}
