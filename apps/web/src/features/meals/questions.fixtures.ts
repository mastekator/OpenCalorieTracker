import type { Recognition } from '@oct/shared';

const d = (
  name: string,
  grams: number,
  kcal: number,
  proteinG: number,
  fatG: number,
  carbsG: number,
) => ({ name, grams, kcal, proteinG, fatG, carbsG });
const o = (label: string, ...rest: Parameters<typeof d>) => ({
  label,
  ...d(...rest),
});

/** Cases K1–K6 of the AI's questions (product OCT-232 §10, design OCT-234 H), as the API sends them. */
export const QUESTION_CASES = {
  /** K1: the salad's dressing; the guess is mayo. */
  k1: {
    dishes: [
      {
        ...d('Vegetable salad with mayo', 250, 260, 3, 24, 9),
        confidence: 0.6,
      },
      { ...d('Grilled chicken', 120, 198, 37, 5, 0), confidence: 0.85 },
    ],
    questions: [
      {
        dish: 0,
        text: 'What’s the salad dressing?',
        guess: 0,
        options: [
          o('Mayo', 'Vegetable salad with mayo', 250, 260, 3, 24, 9),
          o('Yogurt', 'Vegetable salad with yogurt', 250, 110, 5, 4, 11),
          o('Oil', 'Vegetable salad with oil', 250, 200, 3, 18, 9),
          o('No dressing', 'Vegetable salad', 250, 50, 3, 0, 9),
        ],
      },
    ],
  },
  /** K2: what it looked like — sweet potato, pumpkin or carrot. */
  k2: {
    dishes: [
      { ...d('Baked sweet potato', 200, 172, 3, 0, 40), confidence: 0.6 },
    ],
    questions: [
      {
        dish: 0,
        text: 'What is this?',
        guess: 0,
        options: [
          o('Sweet potato', 'Baked sweet potato', 200, 172, 3, 0, 40),
          o('Pumpkin', 'Baked pumpkin', 220, 57, 2, 0, 13),
          o('Carrot', 'Baked carrot', 200, 80, 2, 0, 18),
        ],
      },
    ],
  },
  /** K3: a homemade dish; the own recipe goes through «Other…». */
  k3: {
    dishes: [
      { ...d('Classic cheesecake', 150, 480, 9, 34, 35), confidence: 0.6 },
      { ...d('Coffee with milk', 250, 60, 3, 3, 5), confidence: 0.85 },
    ],
    questions: [
      {
        dish: 0,
        text: 'Which cheesecake?',
        guess: 0,
        options: [
          o('Classic', 'Classic cheesecake', 150, 480, 9, 34, 35),
          o(
            'Light, cottage cheese',
            'Cottage cheese cheesecake',
            150,
            270,
            20,
            12,
            22,
          ),
        ],
      },
    ],
  },
  /** K4 and K5: what is in the coffee and how the patty was cooked; none about the buckwheat. */
  k4k5: {
    dishes: [
      { ...d('Fried chicken patty', 120, 290, 22, 19, 8), confidence: 0.6 },
      { ...d('Boiled buckwheat', 150, 165, 6, 2, 32), confidence: 0.85 },
      { ...d('Coffee with milk', 250, 60, 3, 3, 5), confidence: 0.7 },
    ],
    questions: [
      {
        dish: 0,
        text: 'How was it cooked?',
        guess: 0,
        options: [
          o('Fried', 'Fried chicken patty', 120, 290, 22, 19, 8),
          o('Baked', 'Baked chicken patty', 120, 200, 23, 9, 7),
          o('Boiled', 'Boiled chicken patty', 120, 180, 23, 8, 6),
        ],
      },
      {
        dish: 2,
        text: 'What’s in the coffee?',
        guess: 1,
        options: [
          o('Nothing', 'Black coffee', 250, 5, 0, 0, 0),
          o('Milk', 'Coffee with milk', 250, 60, 3, 3, 5),
          o('Sugar', 'Coffee with sugar', 250, 45, 0, 0, 10),
          o('Milk and sugar', 'Coffee with milk and sugar', 250, 100, 3, 3, 15),
        ],
      },
    ],
  },
  /** K6: no photo, «60 g oatmeal» — water or milk. */
  k6: {
    dishes: [
      { ...d('Oatmeal with water', 60, 211, 7, 4, 36), confidence: 0.6 },
    ],
    questions: [
      {
        dish: 0,
        text: 'Made with water or milk?',
        guess: 0,
        options: [
          o('Water', 'Oatmeal with water', 60, 211, 7, 4, 36),
          o('Milk', 'Oatmeal with milk', 60, 290, 11, 9, 42),
        ],
      },
    ],
  },
} satisfies Record<string, Required<Recognition>>;
