import { lighterVariant, type LighterResponse } from '@oct/shared';
import { PILAF } from './fixtures';

const keep = (from: number) => ({
  change: 'same' as const,
  from,
  name: '',
  grams: 0,
  per100: null,
  why: '',
});

/** Two variants of PILAF as the server answers them (frame 7.3). */
export const PILAF_LIGHTER: LighterResponse = {
  variants: [
    lighterVariant(PILAF.ingredients, {
      ingredients: [
        keep(0),
        {
          change: 'replaced',
          from: 1,
          name: 'Skinless chicken thigh',
          grams: 500,
          per100: { kcal: 120, proteinG: 20, fatG: 4, carbsG: 0 },
          why: 'Half the fat, still a meat pilaf',
        },
        {
          change: 'reduced',
          from: 4,
          name: 'Sunflower oil',
          grams: 20,
          per100: null,
          why: 'A thick-bottomed pot, fry under the lid',
        },
      ],
    })!,
    lighterVariant(PILAF.ingredients, {
      ingredients: [
        {
          change: 'reduced',
          from: 0,
          name: 'Long-grain rice',
          grams: 300,
          per100: null,
          why: 'More vegetables, same volume',
        },
        {
          change: 'added',
          from: null,
          name: 'Chickpeas',
          grams: 100,
          per100: { kcal: 120, proteinG: 7, fatG: 2, carbsG: 19 },
          why: 'More protein and fibre',
        },
      ],
    })!,
  ],
};
