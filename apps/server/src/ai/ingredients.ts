import {
  EDIBLE_KEYS,
  edibleGrams,
  ingredientsModelSchema,
  normalizeGtin,
  round1,
  type IngredientModelRow,
  type RecognizedIngredient,
} from '@oct/shared';
import { languageName } from './common.js';
import { edibleKey, pickEdible } from './edible.js';
import type { AiModel } from './model.js';
import { askVision, PET_FOOD_RULE } from './recognize.js';

/** Bump on every prompt change; it is logged with each call. */
export const INGREDIENTS_PROMPT_VERSION = 1;

/** Rules only, no user data (ADR-0020 §7, ADR-0040 §3). */
export function ingredientsPrompt(locale: string) {
  return `You read raw products laid out for cooking on a photo: ingredients, not ready meals.
List every separate product once. Write each name as the raw product in ${languageName(locale)}.
Weight — only read, never convert units or count portions:
- a product on kitchen scales: "weightFrom" is "scale", "readValue" and "readUnit" are the number and unit shown on the scales; it is the weight of the product on them, do not subtract any container;
- a package with its net weight or volume printed: "weightFrom" is "package", "readValue" and "readUnit" as printed;
- otherwise "weightFrom", "readValue" and "readUnit" are null.
"readUnit" is one of g, kg, ml, l, lb, oz.
Always set "estimateG" to your estimate of the product's weight in grams (millilitres for a liquid).
Set "unit" to "ml" for a liquid, otherwise null.
kcal100, protein100, fat100 and carbs100 are kcal and grams per 100 g (100 ml) of the raw product.
Confidence is 0..1; blurry, dark or partial photos: below 0.5.
For a product sold with inedible parts (peel, pits, seeds, shells, bones) set "edibleRef" to the matching key from this list, or null when none matches: ${EDIBLE_KEYS}. Only when no key matches set "ediblePct" to your estimate of the edible share in percent (10 to 100); otherwise null. Packaged and already peeled products: both null.
${PET_FOOD_RULE}
The message may have a <barcodes> tag with retail barcodes read from packages on the photo.
For a product that is one of these packages set barcode to its number exactly as listed, otherwise null.
For a package also set printedBarcode to the digits printed under its barcode lines exactly as you read them on the photo — do not copy them from the <barcodes> tag; null if the digits are not legible.
If there are no products on the photo, return an empty list.`;
}

/**
 * Reads the raw products on a JPEG photo (ADR-0040 §3): `askVision` with its silent retry and
 * 60 s timeout; no questions in this mode. `barcodes` from the decoder go in a `<barcodes>` tag;
 * a row's barcode not from the tag is dropped, printed digits are kept only as a valid GTIN.
 */
export function recognizeIngredients(
  model: AiModel,
  jpeg: Uint8Array,
  locale: string,
  barcodes: string[] = [],
  opts: Pick<Parameters<typeof askVision>[2], 'signal' | 'onUsage'> = {},
): Promise<IngredientModelRow[]> {
  return askVision(
    model,
    jpeg,
    {
      op: 'ingredients',
      system: ingredientsPrompt(locale),
      text: barcodes.length
        ? `<barcodes>${barcodes.join(' ')}</barcodes>`
        : undefined,
      schema: ingredientsModelSchema,
      promptVersion: INGREDIENTS_PROMPT_VERSION,
      logExtra: (r) => `items=${r?.length ?? 0}`,
      ...opts,
    },
    (output) =>
      output.items.map((row) => {
        const code = row.barcode ? normalizeGtin(row.barcode) : null;
        const printed = row.printedBarcode
          ? normalizeGtin(row.printedBarcode)
          : null;
        return {
          ...row,
          barcode: code && barcodes.includes(code) ? code : null,
          printedBarcode: printed,
        };
      }),
  );
}

/**
 * The edible part of every raw product with an edible hint (ADR-0040 §4, AC-B7): the weight read
 * or estimated is gross, the share is picked like a meal dish's but never asked. `prefs` reads the
 * user's shares by key. Products found by barcode and liquids stay as they are.
 */
export function applyIngredientEdible(
  rows: { row: IngredientModelRow; item: RecognizedIngredient }[],
  prefs: (keys: string[]) => Map<string, number>,
): RecognizedIngredient[] {
  const hinted = ({ row, item }: (typeof rows)[number]) =>
    item.source === 'ai' &&
    item.unit !== 'ml' &&
    (row.edibleRef !== null || row.ediblePct !== null);
  const keyOf = (row: IngredientModelRow) =>
    edibleKey({ name: row.name, edibleRef: row.edibleRef });
  const keys = rows.filter(hinted).map(({ row }) => keyOf(row));
  const own = keys.length ? prefs(keys) : new Map<string, number>();
  return rows.map((r) => {
    const { row, item } = r;
    if (!hinted(r)) return item;
    const key = keyOf(row);
    const picked = pickEdible(
      { ...row, confidence: row.confidence ?? 0 },
      own.get(key),
    );
    if (!picked) return item;
    const grams = edibleGrams(item.grams, picked.pct);
    const of = (n: number) => round1((n * grams) / 100);
    return {
      ...item,
      grams,
      kcal: of(item.per100.kcal),
      proteinG: of(item.per100.proteinG),
      fatG: of(item.per100.fatG),
      carbsG: of(item.per100.carbsG),
      edible: { grossG: item.grams, ...picked, key },
    };
  });
}
