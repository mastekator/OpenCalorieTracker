import { z } from 'zod';
import {
  DISH_GRAMS,
  illustrationIdSchema,
  nameKey,
  round1,
  scaleItem,
  sumDay,
  uuid,
  type FixedField,
  type IllustrationId,
  type MealItemInput,
  type RecognizedDish,
  type RefineDishIn,
} from '@oct/shared';
import type { ManualDish } from '../../ui/ManualDishSheet/ManualDishSheet';

/**
 * `illustration`: picked by hand on this dish — a loaded meal passes it only with
 * `illustrationManual`, or the automatic one would freeze and stop following the name.
 */
export type Dish = ManualDish & {
  confidence?: number;
  illustration?: IllustrationId;
};

export const previousSchema = z.array(
  z
    .object({
      mealId: z.number(),
      eatenAt: z.string(),
      grams: z.number(),
      kcal: z.number(),
      proteinG: z.number(),
      fatG: z.number(),
      carbsG: z.number(),
      illustration: illustrationIdSchema,
    })
    .nullable(),
);
/** The fields of `PreviousDish` the hint uses. */
export type Previous = NonNullable<z.infer<typeof previousSchema>[number]>;

export type Row = {
  /** Stable key: rows are deleted and put back in place (4.5). */
  id: string;
  /** As recognized or entered, with the current name: every recalculation starts from here (AC-3.2). */
  original: Dish;
  source: 'ai' | 'manual' | 'history';
  /** Null while the weight field is invalid (AC-3.4). */
  grams: number | null;
  /** Last valid weight: the numbers stay on it while the field is invalid. */
  shown: number;
  /** Set by hand on an AI dish; any of it hides the confidence badge (AC-2.9, ADR-0020 §2). */
  fixed: FixedField[];
  /** A similar dish from the history: the hint under the row (4.3). */
  previous?: Previous;
};

const inRange = (g: number) => g >= DISH_GRAMS.min && g <= DISH_GRAMS.max;

export function toRow(original: Dish, source: Row['source'] = 'ai'): Row {
  // AI grams may carry any decimals; the API takes one (mealItemInputSchema).
  const g = round1(original.grams);
  return {
    id: uuid(),
    original,
    source,
    grams: inRange(g) ? g : null,
    shown: g,
    fixed: [],
  };
}

export const itemOf = (row: Row): MealItemInput => {
  const { name, kcal, proteinG, fatG, carbsG, grams, confidence } = scaleItem(
    row.original,
    row.shown,
  );
  return {
    name,
    grams,
    kcal,
    proteinG,
    fatG,
    carbsG,
    source: row.source,
    // A manual dish has no confidence (AC-3.9).
    ...(row.source === 'ai' && !row.fixed.length && { confidence }),
    // Only a hand-picked one is sent; the server matches the rest (ADR-0009).
    ...(row.original.illustration && {
      illustration: row.original.illustration,
    }),
  };
};

/** `fixed` plus `field`, once. */
export const withFixed = (fixed: FixedField[], field: FixedField) =>
  fixed.includes(field) ? fixed : [...fixed, field];

const ALL: FixedField[] = ['name', 'grams', 'nutrients'];

/** A manual or «Same as last time» dish is the user's as a whole; an AI one — what they edited. */
export const fixedOf = (row: Row): FixedField[] =>
  row.source === 'ai' ? row.fixed : ALL;

/** The numbers as they go to the AI and are compared back: one decimal. */
const valuesOf = (row: Row) => {
  const { name, grams, kcal, proteinG, fatG, carbsG } = itemOf(row);
  return {
    name,
    grams: round1(grams),
    kcal: round1(kcal),
    proteinG: round1(proteinG),
    fatG: round1(fatG),
    carbsG: round1(carbsG),
  };
};

/** The list for POST /api/ai/refine: ids `d1…dN` live only for this request (ADR-0020 §3). */
export const toRequest = (rows: Row[]): RefineDishIn[] =>
  rows.map((row, i) => ({
    id: `d${i + 1}`,
    ...valuesOf(row),
    fixed: fixedOf(row),
  }));

/** «new», or «changed, was …» with the dish's previous name and weight. */
export type Mark =
  { kind: 'new' } | { kind: 'changed'; name: string; grams: number };

export type Applied = {
  rows: Row[];
  /** By row id; a dish left as it was has none. */
  marks: Record<string, Mark>;
  /** Names of the dishes the AI dropped («Removed: …»). */
  removed: string[];
  /** Total kcal after minus before («+180 kcal»). */
  kcalDelta: number;
};

const NUTRIENTS = ['kcal', 'proteinG', 'fatG', 'carbsG'] as const;

/** Which of the dish's parts the AI changed against the row it replaces. */
function changesOf(row: Row, dish: RecognizedDish) {
  const was = valuesOf(row);
  return {
    name: dish.name !== was.name,
    grams: round1(dish.grams) !== was.grams,
    nutrients: NUTRIENTS.some((k) => round1(dish[k]) !== was[k]),
  };
}

const kcalOf = (rows: Row[]) => sumDay(rows.map(itemOf)).kcal;

function result(
  before: Row[],
  rows: Row[],
  marks: Applied['marks'],
  gone: Row[],
): Applied {
  return {
    rows,
    marks,
    removed: gone.map((r) => r.original.name),
    kcalDelta: kcalOf(rows) - kcalOf(before),
  };
}

const changedMark = (row: Row): Mark => ({
  kind: 'changed',
  name: row.original.name,
  grams: row.shown,
});

// `ref` belongs to the request only.
const aiRow = ({
  name,
  grams,
  kcal,
  proteinG,
  fatG,
  carbsG,
  confidence,
}: RecognizedDish) =>
  toRow({ name, grams, kcal, proteinG, fatG, carbsG, confidence });

/**
 * «Refine»: the answer is the whole new list; `ref` points at the dish it replaces. An unknown
 * or repeated `ref` makes a new dish; a dish nobody points at is removed (ADR-0020 §3).
 */
export function applyRefine(rows: Row[], dishes: RecognizedDish[]): Applied {
  const used = new Set<number>();
  const marks: Applied['marks'] = {};
  const next = dishes.map((dish) => {
    const at = dish.ref ? Number(/^d(\d+)$/.exec(dish.ref)?.[1]) - 1 : -1;
    const old = rows[at];
    if (!old || used.has(at)) {
      const row = aiRow(dish);
      marks[row.id] = { kind: 'new' };
      return row;
    }
    used.add(at);
    const changes = changesOf(old, dish);
    if (!changes.name && !changes.grams && !changes.nutrients) return old;
    // Changed: an AI dish now; what the user set and the AI left alone stays theirs.
    const row = aiRow(dish);
    row.fixed = fixedOf(old).filter((f) => !changes[f]);
    if (!changes.name && old.original.illustration)
      row.original.illustration = old.original.illustration;
    marks[row.id] = changedMark(old);
    return row;
  });
  return result(
    rows,
    next,
    marks,
    rows.filter((_, i) => !used.has(i)),
  );
}

/**
 * «Recognize again»: every AI dish goes, edited or not (AC-1.5); manual and «Same as last
 * time» ones stay. Marks pair old and new AI dishes by `nameKey` (ADR-0020 §3).
 */
export function applyAgain(rows: Row[], dishes: RecognizedDish[]): Applied {
  const kept = rows.filter((r) => r.source !== 'ai');
  const oldAi = rows.filter((r) => r.source === 'ai');
  const marks: Applied['marks'] = {};
  const next = dishes.map((dish) => {
    const row = aiRow(dish);
    const at = oldAi.findIndex(
      (r) => nameKey(r.original.name) === nameKey(dish.name),
    );
    const old = oldAi[at];
    if (!old) marks[row.id] = { kind: 'new' };
    else {
      oldAi.splice(at, 1);
      const changes = changesOf(old, dish);
      if (changes.grams || changes.nutrients) marks[row.id] = changedMark(old);
    }
    return row;
  });
  return result(rows, [...kept, ...next], marks, oldAi);
}
