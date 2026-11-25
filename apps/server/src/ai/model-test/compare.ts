import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  confidenceLevel,
  type AiTestMiss,
  type Recognition,
} from '@oct/shared';

/** apps/server/test-photos: same depth from src/ and dist/, copied into the image (ADR-0019). */
export const TEST_PHOTOS_DIR = new URL(
  '../../../test-photos/',
  import.meta.url,
);

const kcalPair = z
  .tuple([z.number().positive(), z.number().positive()])
  .refine(([a, b]) => a <= b, 'min above max');

/** One expected dish: any of `words` names it; the first one is its label (ADR-0033 §1). */
const expectedDishSchema = z.strictObject({
  words: z.array(z.string().trim().min(1)).min(1),
  count: z.number().int().positive().optional(),
});

const foodSchema = z
  .strictObject({
    file: z.string().min(1),
    level: z.enum(['exact', 'notExact']),
    dishes: z.array(expectedDishSchema).min(1),
    /** kcal of the portion in the photo; the range is computed (AC-9a). */
    ref: z.number().positive().optional(),
    /** Label kcal per 100 g, for a pack without a visible weight (AC-5a). */
    per100: kcalPair.optional(),
    /** The answer must ask at least one question, of any kind (ADR-0039 §6). */
    question: z.literal(true).optional(),
  })
  .refine((p) => (p.ref === undefined) !== (p.per100 === undefined), {
    message: 'exactly one of ref and per100',
  });

/** Raw products for a recipe, run through `?mode=ingredients` recognition (ADR-0040 §7). */
const ingredientsSchema = z.strictObject({
  file: z.string().min(1),
  mode: z.literal('ingredients'),
  /** Grams within ±20% for `exact` (scale, package), ±30% for `notExact` (an estimate). */
  level: z.enum(['exact', 'notExact']),
  items: z
    .array(
      z.strictObject({
        words: z.array(z.string().trim().min(1)).min(1),
        /** Edible grams of the product in the photo. */
        grams: z.number().positive(),
        /** A GTIN the answer must carry for this product, read or printed. */
        barcode: z.string().min(1).optional(),
      }),
    )
    .min(1),
});

const caseSchema = z.union([foodSchema, ingredientsSchema]);

const photoSchema = z.union([
  z.strictObject({ file: z.string().min(1), empty: z.literal(true) }),
  caseSchema,
]);

export const expectedFileSchema = z.strictObject({
  /** Bumped on any change of photos, words or ref (ADR-0033 §1). */
  set: z.number().int().positive(),
  photos: z.array(photoSchema).min(1),
  /** Cases waiting for a free photo: never run, moved to `photos` when one comes. */
  awaiting: z.array(caseSchema).optional(),
});

export type Expected = z.infer<typeof photoSchema>;
export type ExpectedIngredients = z.infer<typeof ingredientsSchema>;
type ExpectedMeal = Exclude<Expected, { empty: true } | ExpectedIngredients>;
export type ExpectedFile = z.infer<typeof expectedFileSchema>;

/** ±20% for countable items, ±30% for mixed dishes (AC-9a). */
export function kcalRange(e: ExpectedMeal) {
  if (e.per100)
    return [Math.round(e.per100[0] * 0.9), Math.round(e.per100[1] * 1.1)];
  const d = e.level === 'exact' ? 0.2 : 0.3;
  return [Math.round(e.ref! * (1 - d)), Math.round(e.ref! * (1 + d))];
}

/** Lower case without diacritics, for names and words alike. */
const norm = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A word matches from the start of a word of the name, with an optional plural ending:
 * «eggs» is egg, «eggplant» is not (E-2).
 */
const matches = (name: string, word: string) =>
  new RegExp(`(^|[^a-z0-9])${escape(norm(word))}(e?s)?($|[^a-z0-9])`).test(
    name,
  );

const NUMBER_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

/** How many items one entry names: «3 eggs», «Eggs ×3», «three eggs» (E-3); otherwise 1. */
export function quantityOf(name: string) {
  const n = norm(name);
  // 1–2 digits not part of a weight or a decimal: «Egg 50 g» is one egg.
  const digits =
    /(?:^|[^0-9.,])(\d{1,2})(?![0-9.,]|\s*(?:g|gr|ml|kcal|oz|%)\b)/.exec(n);
  if (digits) return Math.max(1, Number(digits[1]));
  const word = new RegExp(
    `(^|[^a-z])(${NUMBER_WORDS.join('|')})($|[^a-z])`,
  ).exec(n);
  return word ? NUMBER_WORDS.indexOf(word[2]!) + 1 : 1;
}

export const totalKcal = (r: Recognition) =>
  Math.round(r.dishes.reduce((sum, d) => sum + d.kcal, 0));

/** Every reason the recognition misses the expectation, none when it matches (ADR-0033 §2). */
export function compare(
  expected: Exclude<Expected, ExpectedIngredients>,
  got: Recognition,
): AiTestMiss[] {
  if ('empty' in expected)
    return got.dishes.length === 0 ? [] : [{ code: 'empty' }];
  if (got.dishes.length === 0) return [{ code: 'nothing' }];

  // Each entry goes to the first expected dish it names, and to no other (E-5).
  const counts = expected.dishes.map(() => 0);
  const matched: Recognition['dishes'] = [];
  for (const d of got.dishes) {
    const name = norm(d.name);
    const i = expected.dishes.findIndex((e) =>
      e.words.some((w) => matches(name, w)),
    );
    if (i < 0) continue; // An extra dish fails nothing (AC-4).
    counts[i]! += quantityOf(d.name);
    matched.push(d);
  }

  const misses: AiTestMiss[] = [];
  const label = (i: number) => expected.dishes[i]!.words[0]!;
  const missing = counts.flatMap((n, i) => (n ? [] : [label(i)]));
  if (missing.length) misses.push({ code: 'not_recognized', dishes: missing });
  expected.dishes.forEach(({ count }, i) => {
    const n = counts[i]!;
    if (count && n && n !== count)
      misses.push({ code: 'count', dish: label(i), expected: count, got: n });
  });

  const [min, max] = kcalRange(expected);
  const inRange = (k: number) => k >= min! && k <= max!;
  const kcalOk = expected.per100
    ? // Density of every matched entry; one without grams can't be checked (E-7).
      matched.length > 0 &&
      matched.every((d) => d.grams > 0 && inRange((d.kcal / d.grams) * 100))
    : inRange(totalKcal(got));
  if (!kcalOk) misses.push({ code: 'kcal' });

  const exact = got.dishes.map(
    (d) => confidenceLevel(d.confidence) === 'exact',
  );
  if (expected.level === 'exact' && !exact.every(Boolean))
    misses.push({ code: 'exact' });
  if (expected.level === 'notExact' && exact.some(Boolean))
    misses.push({ code: 'approx' });
  if (expected.question && !got.questions?.length)
    misses.push({ code: 'no_question' });
  return misses;
}

/** A recognized raw product with every code the answer gave for it. */
export type GotIngredient = { name: string; grams: number; codes: string[] };

const gramsRange = (e: ExpectedIngredients, grams: number) => {
  const d = e.level === 'exact' ? 0.2 : 0.3;
  return [Math.round(grams * (1 - d)), Math.round(grams * (1 + d))] as const;
};

/** Every miss of a raw-products answer (ADR-0040 §7): names by words, grams by range, codes. */
export function compareIngredients(
  expected: ExpectedIngredients,
  got: GotIngredient[],
): AiTestMiss[] {
  if (got.length === 0) return [{ code: 'nothing' }];
  // Each row goes to the first expected product it names, like a meal's dish (E-5).
  const rows = expected.items.map(() => [] as GotIngredient[]);
  for (const g of got) {
    const name = norm(g.name);
    const i = expected.items.findIndex((e) =>
      e.words.some((w) => matches(name, w)),
    );
    if (i >= 0) rows[i]!.push(g);
  }
  const misses: AiTestMiss[] = [];
  const label = (i: number) => expected.items[i]!.words[0]!;
  const missing = rows.flatMap((r, i) => (r.length ? [] : [label(i)]));
  if (missing.length) misses.push({ code: 'not_recognized', dishes: missing });
  expected.items.forEach((e, i) => {
    const r = rows[i]!;
    if (!r.length) return;
    const grams = Math.round(r.reduce((sum, g) => sum + g.grams, 0));
    const [min, max] = gramsRange(expected, e.grams);
    if (grams < min || grams > max)
      misses.push({ code: 'grams', dish: label(i), got: grams });
    if (e.barcode && !r.some((g) => g.codes.includes(e.barcode!)))
      misses.push({ code: 'barcode', dish: label(i) });
  });
  return misses;
}

/** A miss in English, for `result`, the report and check-model (ADR-0033 §3). */
function missText(m: AiTestMiss) {
  switch (m.code) {
    case 'not_recognized':
      return `Not recognized: ${m.dishes.join(', ')}`;
    case 'count':
      return `${m.dish}: expected ${m.expected}, got ${m.got}`;
    case 'kcal':
      return 'Calories out of range';
    case 'exact':
      return 'not every dish is exact';
    case 'approx':
      return 'a mixed dish is exact';
    case 'empty':
      return 'expected no dishes';
    case 'nothing':
      return 'no dishes';
    case 'no_question':
      return 'no question asked';
    case 'grams':
      return `${m.dish}: ${m.got} g out of range`;
    case 'barcode':
      return `${m.dish}: barcode not read`;
  }
}

export async function readExpected(): Promise<ExpectedFile> {
  const json = JSON.parse(
    await readFile(new URL('expected.json', TEST_PHOTOS_DIR), 'utf8'),
  ) as unknown;
  const parsed = expectedFileSchema.safeParse(json);
  if (!parsed.success)
    throw new Error(`expected.json: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/** What the photo expects, for the report: `egg ×3; 172-258 kcal; exact`. */
export function expectedText(e: Expected) {
  if ('empty' in e) return '(none)';
  if ('mode' in e)
    return `${e.items
      .map((i) => `${i.words[0]} ${gramsRange(e, i.grams).join('-')} g`)
      .join(', ')}; ${e.level}`;
  const dishes = e.dishes
    .map((d) => (d.count ? `${d.words[0]} ×${d.count}` : d.words[0]))
    .join(', ');
  const unit = e.per100 ? 'kcal/100 g' : 'kcal';
  return `${dishes}; ${kcalRange(e).join('-')} ${unit}; ${e.level}`;
}

/** One photo's columns of a model test, from a recognition. */
export function checkPhoto(
  expected: Exclude<Expected, ExpectedIngredients>,
  got: Recognition,
) {
  const misses = compare(expected, got);
  return {
    got: got.dishes.map((d) => d.name).join(', ') || '(none)',
    kcal: totalKcal(got),
    levels: got.dishes.map((d) => confidenceLevel(d.confidence)).join(','),
    misses,
    result: misses.map(missText).join(' · ') || 'ok',
  };
}

/** One raw-products photo's columns of a model test. */
export function checkIngredients(
  expected: ExpectedIngredients,
  got: (GotIngredient & { kcal: number })[],
) {
  const misses = compareIngredients(expected, got);
  return {
    got:
      got.map((g) => `${g.name} ${Math.round(g.grams)} g`).join(', ') ||
      '(none)',
    kcal: Math.round(got.reduce((sum, g) => sum + g.kcal, 0)),
    misses,
    result: misses.map(missText).join(' · ') || 'ok',
  };
}
