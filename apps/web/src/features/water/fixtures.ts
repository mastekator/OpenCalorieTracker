import { BUILTIN_DRINKS, type DrinkEntry } from '@oct/shared';
import { useT } from '../../i18n';
import type { DrinkTileInfo } from './WaterCard';

const ORDER = [
  'water',
  'coffee_milk',
  'tea',
  'coffee',
  'juice',
  'milk',
  'soda',
  'kefir',
] as const;

/** Story fixtures: the drinks row in the story's locale, and a day of kcal drinks. */
export function useRow(): DrinkTileInfo[] {
  const { t } = useT();
  return ORDER.map((key) => {
    const d = BUILTIN_DRINKS.find((b) => b.key === key)!;
    return {
      key,
      name: t(`drinks.${key}`),
      illustration: d.illustration,
      countsWater: true,
      per100: d.per100,
    };
  });
}

export const entry = (over: Partial<DrinkEntry>): DrinkEntry => ({
  clientId: 'd1',
  date: '2026-11-14',
  takenAt: '2026-11-14T13:20:00Z',
  drinkKey: 'juice',
  illustration: 'drinks',
  ml: 250,
  countsWater: true,
  kcal: 113,
  proteinG: 1,
  fatG: 0,
  carbsG: 26,
  deleted: false,
  ...over,
});

export const DRINKS = [
  entry({}),
  entry({
    clientId: 'd2',
    takenAt: '2026-11-14T05:15:00Z',
    drinkKey: 'coffee_milk',
    illustration: 'coffee',
    kcal: 75,
  }),
];
