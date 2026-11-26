import { z } from 'zod';
import { addDays } from '../dates.js';
import {
  illustrationIdSchema,
  type IllustrationId,
} from '../illustrations/dictionary.js';
import type { Macros } from '../norm/calculate.js';
import type { Sex } from '../norm/schemas.js';
import { round1 } from '../units.js';

/**
 * Built-in drinks (OCT-30 AC-3.1, ADR-0028 §2): constants, not DB rows. Names
 * live in the i18n dictionaries as `drinks.<key>`; values are per 100 ml.
 */
// prettier-ignore
export const BUILTIN_DRINKS = [
  { key: 'water',       illustration: 'drinks-water', per100: { kcal: 0,  proteinG: 0,   fatG: 0,   carbsG: 0 } },
  { key: 'tea',         illustration: 'coffee-tea',   per100: { kcal: 0,  proteinG: 0,   fatG: 0,   carbsG: 0 } },
  { key: 'coffee',      illustration: 'coffee',       per100: { kcal: 0,  proteinG: 0,   fatG: 0,   carbsG: 0 } },
  { key: 'coffee_milk', illustration: 'coffee',       per100: { kcal: 30, proteinG: 1.5, fatG: 1.3, carbsG: 2.4 } },
  { key: 'juice',       illustration: 'drinks',       per100: { kcal: 45, proteinG: 0.5, fatG: 0.1, carbsG: 10.4 } },
  { key: 'milk',        illustration: 'dairy',        per100: { kcal: 52, proteinG: 2.8, fatG: 2.5, carbsG: 4.7 } },
  { key: 'soda',        illustration: 'drinks',       per100: { kcal: 42, proteinG: 0,   fatG: 0,   carbsG: 10.6 } },
  { key: 'kefir',       illustration: 'dairy-yogurt', per100: { kcal: 53, proteinG: 2.9, fatG: 2.5, carbsG: 4 } },
] as const satisfies readonly {
  key: string;
  illustration: IllustrationId;
  per100: Macros;
}[];

export type BuiltinDrinkKey = (typeof BUILTIN_DRINKS)[number]['key'];
export const builtinDrinkKeySchema = z.enum(
  BUILTIN_DRINKS.map((d) => d.key) as [BuiltinDrinkKey, ...BuiltinDrinkKey[]],
);
/** A built-in key or `custom:<id>` of the user's own drink. */
export const drinkKeySchema = z.union([
  builtinDrinkKeySchema,
  z.string().regex(/^custom:[1-9]\d*$/),
]);

export const DRINK_ML = { min: 10, max: 2000 } as const;
export const WATER_GOAL_ML = { min: 500, max: 6000 } as const;
/** EFSA reference minus ~20 % water from food (AC-4.2). */
export const WATER_REFERENCE_ML = { female: 1600, other: 2000 } as const;

const per100Schema = z.object({
  kcal: z.number().min(0).max(1000),
  proteinG: z.number().min(0).max(100),
  fatG: z.number().min(0).max(100),
  carbsG: z.number().min(0).max(100),
});

/** `POST /api/drinks`, `PATCH /api/drinks/:id` body: the user's own drink. */
export const drinkInputSchema = per100Schema.extend({
  name: z.string().trim().min(1).max(40),
  illustration: illustrationIdSchema,
  countsWater: z.boolean(),
});
export type DrinkInput = z.infer<typeof drinkInputSchema>;

/** Snapshot of a drink recognised on a photo (ADR-0028 §6): totals for the entry, not per 100 ml. */
const photoDrinkSchema = z.object({
  name: z.string().trim().min(1).max(80),
  illustration: illustrationIdSchema,
  kcal: z.number().min(0).max(20000),
  proteinG: z.number().min(0).max(2000),
  fatG: z.number().min(0).max(2000),
  carbsG: z.number().min(0).max(2000),
  countsWater: z.boolean(),
});

const entryBase = {
  clientId: z.uuid(),
  date: z.iso.date(),
  takenAt: z.iso.datetime({ offset: true }),
  ml: z.number().int().min(DRINK_ML.min).max(DRINK_ML.max),
};
/** `POST /api/drink-entries` body: exactly one of `drinkKey` or a `photo` snapshot. */
export const drinkEntryInputSchema = z.union([
  z.strictObject({ ...entryBase, drinkKey: drinkKeySchema }),
  z.strictObject({ ...entryBase, photo: photoDrinkSchema }),
]);
export type DrinkEntryInput = z.infer<typeof drinkEntryInputSchema>;

/** `PUT /api/water/goal` value: ml, or null to reset to the reference (AC-4.3). */
export const waterGoalSchema = z
  .number()
  .int()
  .min(WATER_GOAL_ML.min)
  .max(WATER_GOAL_ML.max)
  .nullable();

/** A drink to snapshot: a built-in one has no name here (the UI translates its key). */
export interface DrinkSource {
  name?: string;
  illustration: IllustrationId;
  per100: Macros;
  countsWater?: boolean;
}

/** What an entry stores at the moment it is logged (AC-3.10). */
export interface DrinkSnapshot extends Macros {
  name?: string;
  illustration: IllustrationId;
  ml: number;
  countsWater: boolean;
}

/** Entry fields the day sums read; `deleted` entries count nowhere. */
export interface DrinkEntryLike extends Macros {
  drinkKey: string | null;
  date: string;
  ml: number;
  countsWater: boolean;
  deleted?: boolean;
}

/** Snapshot of `ml` of a drink: kcal and macros are `ml × per 100 ml / 100`, to 0.1. */
export const entryFrom = (drink: DrinkSource, ml: number): DrinkSnapshot => ({
  ...(drink.name === undefined ? {} : { name: drink.name }),
  illustration: drink.illustration,
  ml,
  countsWater: drink.countsWater ?? true,
  kcal: round1((ml * drink.per100.kcal) / 100),
  proteinG: round1((ml * drink.per100.proteinG) / 100),
  fatG: round1((ml * drink.per100.fatG) / 100),
  carbsG: round1((ml * drink.per100.carbsG) / 100),
});

/** Millilitres of water drunk: live entries that count as water (AC-3.3). */
export const waterOfDay = (entries: readonly DrinkEntryLike[]) =>
  entries.reduce((s, e) => (e.deleted || !e.countsWater ? s : s + e.ml), 0);

export interface WaterGoal {
  fromDate: string;
  goalMl: number | null;
}

/** Goal of `date`: the latest row from that day or before; none or null → reference by sex (AC-4.2, 4.5). */
export const waterGoalOn = (
  goals: readonly WaterGoal[],
  date: string,
  sex: Sex | null,
) => {
  const row = goals.reduce<WaterGoal | null>(
    (best, g) =>
      g.fromDate <= date && (best === null || g.fromDate > best.fromDate)
        ? g
        : best,
    null,
  );
  return (
    row?.goalMl ??
    (sex === 'female' ? WATER_REFERENCE_ML.female : WATER_REFERENCE_ML.other)
  );
};

/**
 * Keys of the drink row (AC-3.7): water first, then by how many live entries
 * fall in `today-29…today`. Ties keep the built-in order, own drinks after
 * them by id. Hidden built-ins and deleted own drinks are left out.
 */
export const drinkRowOrder = ({
  entries,
  customDrinks,
  hidden,
  today,
}: {
  entries: readonly DrinkEntryLike[];
  customDrinks: readonly { id: number; deleted?: boolean }[];
  hidden: readonly string[];
  today: string;
}): string[] => {
  const from = addDays(today, -29);
  const count = new Map<string, number>();
  for (const e of entries)
    if (!e.deleted && e.drinkKey !== null && e.date >= from && e.date <= today)
      count.set(e.drinkKey, (count.get(e.drinkKey) ?? 0) + 1);
  const rest = [
    ...BUILTIN_DRINKS.map((d) => d.key as string).filter(
      (k) => k !== 'water' && !hidden.includes(k),
    ),
    ...customDrinks
      .filter((d) => !d.deleted)
      .sort((a, b) => a.id - b.id)
      .map((d) => `custom:${d.id}`),
  ];
  // Array.prototype.sort is stable, so ties keep the order above.
  rest.sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0));
  return ['water', ...rest];
};
