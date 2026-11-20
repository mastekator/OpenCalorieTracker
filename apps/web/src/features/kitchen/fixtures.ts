import type { Meal, MealType, Recipe } from '@oct/shared';

const ing = (name: string, grams: number, kcal: number, p = 0, f = 0, c = 0) =>
  ({
    name,
    grams,
    kcal,
    proteinG: p,
    fatG: f,
    carbsG: c,
    source: 'manual',
  }) as const;

/** The design example (OCT-160): 3 487 kcal, cooked 2 100 g, 6 servings → 166 kcal/100 g, 581 per serving. */
export const PILAF: Recipe = {
  id: 1,
  name: 'Homemade pilaf',
  cookedG: 2100,
  servings: 6,
  note: null,
  // A server test photo, served by Storybook's staticDirs as /api/photos/<id>.
  photoId: 'pilaf.jpg',
  ingredients: [
    ing('Long-grain rice', 400, 1440, 28, 4, 312),
    ing('Pork shoulder', 500, 1300, 70, 112, 0),
    ing('Carrots', 400, 140, 4, 0, 28),
    ing('Onion', 200, 82, 2, 0, 18),
    ing('Sunflower oil', 50, 450, 0, 50, 0),
    ing('Garlic', 50, 75, 3, 0, 15),
    ing('Salt', 0, 0),
    ing('Cumin', 0, 0),
  ],
  steps: [
    {
      text: 'Dice the meat into 2–3 cm cubes, cut the carrots into strips and the onion into half rings.',
      photoId: null,
    },
    {
      text: 'Heat the oil in a cauldron and brown the meat, 8–10 minutes.',
      photoId: 'spaghetti.jpg',
    },
    {
      text: 'Add the onion, after 5 minutes the carrots. Fry 7 more minutes, salt, add cumin.',
      photoId: null,
    },
  ],
  per100: null,
  servingG: null,
  lastLoggedAt: '2026-11-18T12:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
};

/** No servings, no cooked weight, no photo, no steps: per 100 g of the raw weight only. */
export const SALAD: Recipe = {
  id: 2,
  name: 'Greek salad',
  cookedG: null,
  servings: null,
  note: null,
  photoId: null,
  ingredients: [
    ing('Tomatoes', 300, 60, 3, 0, 12),
    ing('Cucumbers', 200, 30, 2, 0, 6),
    ing('Feta', 100, 264, 14, 21, 4),
    ing('Olive oil', 20, 180, 0, 20, 0),
  ],
  steps: [],
  per100: null,
  servingG: null,
  lastLoggedAt: null,
  updatedAt: '2026-11-12T10:00:00.000Z',
};

export const RECIPES: Recipe[] = [
  PILAF,
  {
    ...SALAD,
    id: 3,
    name: 'Syrniki',
    servings: 4,
    cookedG: 560,
    ingredients: [
      ing('Cottage cheese', 400, 476, 64, 20, 12),
      ing('Egg', 60, 94, 8, 6, 0),
      ing('Flour', 60, 200, 6, 1, 42),
      ing('Sugar', 30, 120, 0, 0, 30),
      ing('Oil', 30, 270, 0, 30, 0),
    ],
    lastLoggedAt: '2026-11-15T08:00:00.000Z',
  },
  {
    ...SALAD,
    id: 4,
    name: 'Chicken with vegetables baked in the oven with rosemary and garlic',
    lastLoggedAt: '2026-11-01T12:00:00.000Z',
  },
  SALAD,
];

const meal = (
  id: number,
  localDate: string,
  mealType: MealType,
  dishes: [string, number, number][],
): Meal => {
  const items = dishes.map(([name, grams, kcal]) => ({
    ...ing(name, grams, kcal, kcal / 20, kcal / 30, kcal / 10),
    aiProvider: null,
    aiModel: null,
    confidence: null,
    recipeId: null,
    barcode: null,
    illustration: 'grains' as const,
    illustrationManual: false,
  }));
  const sum = (k: 'kcal' | 'proteinG' | 'fatG' | 'carbsG') =>
    items.reduce((s, i) => s + i[k], 0);
  return {
    id,
    clientId: `m${id}`,
    eatenAt: `${localDate}T12:00:00.000Z`,
    tzOffsetMin: 0,
    localDate,
    mealType,
    photo: null,
    recalcOffer: false,
    items,
    kcal: sum('kcal'),
    proteinG: sum('proteinG'),
    fatG: sum('fatG'),
    carbsG: sum('carbsG'),
  };
};

/** «From a meal» (OCT-160 3.7): recent meals, newest first. */
export const MEALS: Meal[] = [
  meal(3, '2026-11-13', 'lunch', [
    ['Grilled chicken breast', 150, 248],
    ['Buckwheat with mushrooms', 180, 230],
    ['Boiled eggs, 2 pcs', 100, 155],
    ['Sour cream sauce', 40, 84],
  ]),
  meal(2, '2026-11-13', 'breakfast', [
    ['Oatmeal with berries', 250, 310],
    ['Coffee with milk', 200, 60],
  ]),
  meal(1, '2026-11-12', 'dinner', [['Homemade pilaf', 350, 581]]),
];
