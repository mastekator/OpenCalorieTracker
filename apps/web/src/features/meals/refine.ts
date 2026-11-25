import { z } from 'zod';
import {
  DISH_GRAMS,
  edibleGrams,
  illustrationIdSchema,
  nameKey,
  recipePortion,
  round1,
  scaleItem,
  sumDay,
  unitSchema,
  uuid,
  type AiQuestion,
  type Amount,
  type DishSource,
  type Edible,
  type FixedField,
  type IllustrationId,
  type MealItemInput,
  type MergedDish,
  type Recipe,
  type RecognizedDish,
  type RefineDishIn,
} from '@oct/shared';
import type { BarcodeResult } from '../../data/products';
import type { Pack } from '../../ui/AmountPicker/AmountPicker';
import type { ManualDish } from '../../ui/ManualDishSheet/ManualDishSheet';
import { unitOf } from '../../ui/weightUnits';

/**
 * `illustration`: picked by hand on this dish — a loaded meal passes it only with
 * `illustrationManual`, or the automatic one would freeze and stop following the name.
 */
export type Dish = ManualDish & {
  confidence?: number;
  /** `source: 'barcode'` from `mergePackages`: whose product the numbers are. */
  from?: BarcodeResult['from'];
  /** Found by barcode without kcal, no label: the AI's estimate to check (E-12). */
  check?: true;
  /** Another code the AI read on the package: the «Dish» sheet offers it (ADR-0036 §5). */
  alt?: MergedDish['alt'];
  illustration?: IllustrationId;
};

export const previousSchema = z.array(
  z
    .object({
      mealId: z.number(),
      eatenAt: z.string(),
      grams: z.number(),
      unit: unitSchema.optional(),
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
  source: DishSource;
  /** Null while the weight field is invalid (AC-3.4). */
  grams: number | null;
  /** Last valid weight: the numbers stay on it while the field is invalid. */
  shown: number;
  /** Set by hand on an AI dish; any of it hides the confidence badge (AC-2.9, ADR-0020 §2). */
  fixed: FixedField[];
  /** A similar dish from the history: the hint under the row (4.3). */
  previous?: Previous;
  /** A recipe named like the dish: «Your recipe», shown instead of `previous` (ADR-0023 §6). */
  recipe?: Recipe;
  /** The recipe a `source: 'recipe'` dish is a portion of. */
  recipeId?: number;
  /** The AI's question about this dish (ADR-0020 §4); `chosen`: the option tapped, none yet. */
  question?: Question;
  /** A product dish: how much of it, as last picked; none yet: its default (ADR-0037 §5). */
  amount?: Amount;
  /** Package weight and pieces typed in the sheet: sent with the meal, not stored with it (AC-2.5). */
  pack?: Pack;
  /**
   * Gross weight → edible share from the server (ADR-0039 §5): `grams` follow it. `chosen`: the
   * user picked the share, it is remembered on save; `unlinked`: the grams were set by hand.
   */
  edible?: RowEdible;
};

export type RowEdible = Edible & { chosen?: true; unlinked?: true };

export type Question = Omit<AiQuestion, 'dish'> & { chosen?: number };

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
    ...unitOf(row.original.unit),
    kcal,
    proteinG,
    fatG,
    carbsG,
    source: row.source,
    // The server takes a recipe link only on a recipe dish.
    ...(row.source === 'recipe' && row.recipeId && { recipeId: row.recipeId }),
    // A manual dish has no confidence (AC-3.9).
    ...(row.source === 'ai' && !row.fixed.length && { confidence }),
    ...(row.original.barcode && { barcode: row.original.barcode }),
    // Remembered for the code by the server, and on this device by the outbox (ADR-0037 §2).
    ...(row.original.barcode &&
      (row.amount || row.pack) && {
        pack: { ...row.pack, ...(row.amount && { amount: row.amount }) },
      }),
    // Only a hand-picked one is sent; the server matches the rest (ADR-0009).
    ...(row.original.illustration && {
      illustration: row.original.illustration,
    }),
    // Only the user's own share is remembered; the gross weight is never stored (ADR-0039 §4).
    ...(row.edible?.chosen &&
      !row.edible.unlinked && {
        edible: { key: row.edible.key, pct: row.edible.pct },
      }),
  };
};

/** The grams of the row's share, relinked; `pct` is the user's choice, `grossG` keeps the share. */
export function setEdible(
  row: Row,
  { pct, grossG }: { pct?: number; grossG?: number } = {},
): Row {
  if (!row.edible) return row;
  const { grossG: gross, pct: share, source, key, chosen } = row.edible;
  const edible: RowEdible = {
    grossG: grossG ?? gross,
    pct: pct ?? share,
    source,
    key,
    ...((chosen || pct !== undefined) && { chosen: true }),
  };
  const g = edibleGrams(edible.grossG, edible.pct);
  return { ...row, edible, grams: inRange(g) ? g : null, shown: g };
}

/** Grams set by hand: no longer the share of the gross weight. */
export const unlink = (row: Row): Row =>
  row.edible && !row.edible.unlinked
    ? { ...row, edible: { ...row.edible, unlinked: true } }
    : row;

/** «Restore»: the grams of the share again. */
export const relink = (row: Row) => setEdible(row);

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

/** What «Recognize again» keeps: a manual or «Same as last time» dish (AC-1.5). */
const keptOnAgain = (row: Row) => row.source !== 'ai';

/** «Recognize again» sends only the dishes it keeps, or the AI's own edited ones would vanish. */
export const requestDishes = (mode: 'refine' | 'again', rows: Row[]) =>
  toRequest(mode === 'again' ? rows.filter(keptOnAgain) : rows);

/** «new», or «changed, was …» with the dish's previous name, weight and kcal. */
export type Mark =
  | { kind: 'new' }
  | { kind: 'changed'; name: string; grams: number; kcal?: number };

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

const changedMark = (row: Row) => ({
  kind: 'changed' as const,
  name: row.original.name,
  grams: row.shown,
  kcal: itemOf(row).kcal,
});

/** Questions onto the rows of the AI's answer: `dish` is an index into that answer. */
function withQuestions(rows: Row[], questions: AiQuestion[] = []) {
  for (const { dish, ...question } of questions)
    if (rows[dish] && question.options[question.guess])
      rows[dish] = { ...rows[dish], question };
  return rows;
}

/** The server keeps it as the user's own product on save (ADR-0034 §6). */
export const remembers = (i: MealItemInput) =>
  !!i.barcode && i.kcal > 0 && (i.source === 'label' || i.source === 'manual');

/** A new answer brings its own questions; the old ones go (ADR-0020 §4). */
const unasked = (row: Row): Row =>
  row.question ? { ...row, question: undefined } : row;

/** A recognized dish; glued with a package (`mergePackages`) it carries its source and code. */
export type Recognized = Omit<Dish, 'barcode' | 'unit'> & {
  source?: DishSource;
  edible?: Edible;
  barcode?: string | null;
  /** Loose as the AI's answer; anything but 'ml' is grams. */
  unit?: string | null;
};

/** Initial rows of a recognition with its questions. */
export const toRows = (dishes: Recognized[], questions?: AiQuestion[]) =>
  withQuestions(
    dishes.map(({ source, barcode, unit, edible, ...d }) => ({
      ...toRow({ ...d, ...unitOf(unit), ...(barcode && { barcode }) }, source),
      ...(edible && { edible }),
    })),
    questions,
  );

/**
 * A tapped option: the dish takes its name and numbers, locally, and is the user's now
 * (ADR-0020 §4). A weight set by hand stays and the option's numbers follow it.
 * A recipe option (`recipeId`, ADR-0035 §6) makes the dish a portion of `recipe` at the
 * row's weight; the option's own numbers are unused.
 */
export function answer(
  rows: Row[],
  id: string,
  option: number,
  recipe?: Recipe,
): Applied {
  const marks: Applied['marks'] = {};
  const next = rows.map((row) => {
    const o = row.question?.options[option];
    if (row.id !== id || !o || (o.recipeId && o.recipeId !== recipe?.id))
      return row;
    const q = row.question!;
    const common = {
      previous: undefined,
      recipe: undefined,
      question: { ...q, chosen: option },
    };
    marks[row.id] = changedMark(row);
    if (o.recipeId && recipe) {
      const { name, grams, kcal, proteinG, fatG, carbsG } = recipePortion(
        recipe,
        row.shown,
      );
      // «was 480 kcal», not the old name: the «recipe» badge already tells what it is (OCT-352 3.2).
      marks[row.id] = { ...changedMark(row), name };
      return {
        ...row,
        ...common,
        original: { name, grams, kcal, proteinG, fatG, carbsG },
        source: 'recipe' as const,
        recipeId: recipe.id,
        edible: undefined,
        // As «Use the recipe»: a weight edit recalculates from the recipe.
        fixed: [],
      };
    }
    const { name, grams, kcal, proteinG, fatG, carbsG } = o;
    // Moved off the dish's own weight: the user's, not the AI's (the guess's grams may differ).
    const keep = row.grams !== null && row.shown !== round1(row.original.grams);
    // «How much is edible?»: the option's share of the gross weight, the user's choice (ADR-0039 §5).
    const e = o.edible;
    const g = e
      ? edibleGrams(e.grossG, e.pct)
      : keep
        ? row.shown
        : round1(grams);
    const same = nameKey(name) === nameKey(row.original.name);
    return {
      ...row,
      ...common,
      original: {
        name,
        grams,
        kcal,
        proteinG,
        fatG,
        carbsG,
        ...unitOf(row.original.unit),
        // Another dish: its picture follows the new name (as a rename in the sheet).
        ...(same &&
          row.original.illustration && {
            illustration: row.original.illustration,
          }),
      },
      source: 'ai' as const,
      recipeId: undefined,
      // Another product: the gross weight was about the old one.
      edible: e
        ? { ...e, chosen: true as const }
        : same
          ? row.edible
          : undefined,
      grams: (keep && !e) || inRange(g) ? g : null,
      shown: g,
      fixed: ALL,
    };
  });
  return result(rows, next, marks, []);
}

/** A question as shown: `at` maps a shown option back to its index in `row.question`. */
export type ShownQuestion = {
  text: string;
  options: { label: string; recipe?: Recipe }[];
  at: number[];
  guess: number;
  chosen?: number;
};

/**
 * The options left to show: a recipe option needs its recipe in the local copy (E-2.b) and
 * goes when «Your recipe» already offers it (AC-2.6). Fewer than two left, or the guess gone:
 * no question. The tapped one stays, so the answer can still be seen and switched.
 */
export function shownQuestion(
  row: Row,
  recipes: readonly Recipe[],
): ShownQuestion | null {
  const q = row.question;
  if (!q) return null;
  const at: number[] = [];
  const options: ShownQuestion['options'] = [];
  q.options.forEach((o, i) => {
    const recipe = o.recipeId
      ? recipes.find((r) => r.id === o.recipeId)
      : undefined;
    const hidden =
      o.recipeId !== undefined && (!recipe || o.recipeId === row.recipe?.id);
    if (hidden && i !== q.chosen) return;
    at.push(i);
    // The local name: the same as the badge and after a rename.
    options.push(recipe ? { label: recipe.name, recipe } : { label: o.label });
  });
  const guess = at.indexOf(q.guess);
  if (at.length < 2 || guess < 0) return null;
  const chosen = q.chosen === undefined ? undefined : at.indexOf(q.chosen);
  return { text: q.text, options, at, guess, chosen };
}

// `ref` belongs to the request only.
const aiRow = ({
  name,
  grams,
  kcal,
  proteinG,
  fatG,
  carbsG,
  confidence,
  unit,
  edible,
}: RecognizedDish): Row => ({
  ...toRow({
    name,
    grams,
    kcal,
    proteinG,
    fatG,
    carbsG,
    confidence,
    ...unitOf(unit),
  }),
  ...(edible && { edible }),
});

/**
 * «Refine»: the answer is the whole new list; `ref` points at the dish it replaces. An unknown
 * or repeated `ref` makes a new dish; a dish nobody points at is removed (ADR-0020 §3).
 */
export function applyRefine(
  rows: Row[],
  dishes: RecognizedDish[],
  questions?: AiQuestion[],
): Applied {
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
    if (!changes.name && !changes.grams && !changes.nutrients)
      return unasked(old);
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
    withQuestions(next, questions),
    marks,
    rows.filter((_, i) => !used.has(i)),
  );
}

/**
 * «Recognize again»: every AI dish goes, edited or not (AC-1.5); manual and «Same as last
 * time» ones stay. Marks pair old and new AI dishes by `nameKey` (ADR-0020 §3).
 */
export function applyAgain(
  rows: Row[],
  dishes: RecognizedDish[],
  questions?: AiQuestion[],
): Applied {
  const kept = rows.filter(keptOnAgain).map(unasked);
  const oldAi = rows.filter((r) => !keptOnAgain(r));
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
  return result(
    rows,
    [...kept, ...withQuestions(next, questions)],
    marks,
    oldAi,
  );
}
