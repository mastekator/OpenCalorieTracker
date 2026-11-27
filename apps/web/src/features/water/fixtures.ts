import type { DrinkEntry } from '@oct/shared';
import type { DrinkTileInfo } from './WaterCard';

/** Story fixtures: the drinks row and a day of kcal drinks. */
export const ROW: DrinkTileInfo[] = [
  ['water', 'Water', 'drinks-water'],
  ['coffee_milk', 'Coffee with milk', 'coffee'],
  ['tea', 'Tea', 'coffee-tea'],
  ['coffee', 'Coffee', 'coffee'],
  ['juice', 'Juice', 'drinks'],
  ['milk', 'Milk', 'dairy'],
  ['soda', 'Soda', 'drinks'],
  ['kefir', 'Kefir', 'dairy-yogurt'],
].map(([key, name, illustration]) => ({
  key: key!,
  name: name!,
  illustration: illustration as DrinkTileInfo['illustration'],
  countsWater: true,
}));

const entry = (over: Partial<DrinkEntry>): DrinkEntry => ({
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
