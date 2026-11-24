import {
  EDIBLE_KEYS,
  edibleGrams,
  edibleOf,
  nameKey,
  round1,
  scaleItem,
  type AiQuestion,
  type Edible,
  type RecognizedDish,
} from '@oct/shared';

/** Prompt rules for gross weight and the edible share, shared by recognition and refining (ADR-0039 §2). */
export const EDIBLE_PROMPT = `Inedible parts (peel, pits, seeds, shells, bones): "grams" is always the edible part.
- Set "grossG" only to a weight you read (from a receipt, a price tag, scales on the photo or the user's text) of food sold with inedible parts: the whole weight as read, the total weight and never a price per kg. For a weight estimated by eye set "grossG" to null.
- With "grossG" set "edibleRef" to the matching key from this list, or null when none matches: ${EDIBLE_KEYS}. Only when no key matches set "ediblePct" to your estimate of the edible share in percent (10 to 100); otherwise null.
- Packaged food with a barcode, a recipe and already peeled or shelled food: "grossG", "edibleRef" and "ediblePct" are null.
- A product name read on a receipt or price tag is a strong hint: name the dish after it. If the photo shows a different product, ask a question with both products as options, the receipt product as the guess. With several receipt lines take the one that matches the photo; if none matches, ask.
- Eaten a share of a read weight ("ate half of 772 g"): "grossG" is that share of the weight (386).
- Eaten with the peel or whole: "grossG" is null and "grams" is the whole weight. Eaten peeled with no new numbers: "grossG" is the dish's previous weight and "edibleRef" its key.`;

/** Answers of the server's «How much is edible?» (AC-4.4). */
export const EDIBLE_STEPS = [90, 75, 50, 25, 10];
const MAX_QUESTIONS = 3;

const QUESTION: Record<string, { text: string; pct: (p: number) => string }> = {
  ru: { text: 'Сколько примерно съедобно?', pct: (p) => `${p}\u00a0%` },
  en: { text: 'About how much is edible?', pct: (p) => `${p}%` },
};

/** The model's edible hints, narrowed: a gross weight of 1–5000, a key, a share (ADR-0039 §3). */
export function edibleHints(d: RecognizedDish) {
  const g = d.grossG;
  if (typeof g !== 'number' || !(g >= 1 && g <= 5000)) return {};
  return {
    grossG: round1(g),
    ...(typeof d.edibleRef === 'string' && { edibleRef: d.edibleRef }),
    ...(typeof d.ediblePct === 'number' &&
      Number.isFinite(d.ediblePct) && { ediblePct: d.ediblePct }),
  };
}

type Answer<D> = { dishes: D[]; questions: AiQuestion[] };

/** The key a share is remembered by: a known reference key, else the name's key. */
export const edibleKey = (d: Pick<RecognizedDish, 'name' | 'edibleRef'>) =>
  d.edibleRef && edibleOf(d.edibleRef) !== undefined
    ? d.edibleRef
    : nameKey(d.name);

/**
 * The edible share without asking (ADR-0039 §3): the user's own share → the reference →
 * the model's share (10–100, confidence ≥ 0.5); null when none fits.
 */
export function pickEdible(
  d: Pick<RecognizedDish, 'edibleRef' | 'ediblePct' | 'confidence'>,
  mine: number | undefined,
): { pct: number; source: Edible['source'] } | null {
  if (mine !== undefined) return { pct: mine, source: 'user' };
  const ref = d.edibleRef ? edibleOf(d.edibleRef) : undefined;
  if (ref !== undefined) return { pct: ref, source: 'ref' };
  const pct = d.ediblePct;
  if (typeof pct === 'number' && pct >= 10 && pct <= 100 && d.confidence >= 0.5)
    return { pct: Math.round(pct), source: 'ai' };
  return null;
}

/**
 * Picks the edible share of every dish with a gross weight (ADR-0039 §3): the user's own share →
 * the reference → the model's share (10–100, confidence ≥ 0.5) → the server's question with the
 * nearest answer applied. Sets `grams` and rescales the nutrients at the model's density; the
 * hints never leave the server. `prefs` reads the user's shares by key; they never reach the prompt.
 */
export function applyEdible<D extends RecognizedDish>(
  { dishes, questions }: Answer<D>,
  prefs: (keys: string[]) => Map<string, number>,
  locale: string,
  isFixed: (dish: D) => boolean = () => false,
): Answer<D> {
  const withGross = dishes.filter(
    (d) => d.grossG !== undefined && d.grossG !== null && d.unit !== 'ml',
  );
  const own = withGross.length ? prefs(withGross.map(edibleKey)) : new Map();
  const words = QUESTION[locale] ?? QUESTION.en!;
  const asked: AiQuestion[] = [];

  const out = dishes.map((dish, i) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stripped: the hints never leave the server
    const { grossG, edibleRef, ediblePct, ...plain } = dish;
    if (!withGross.includes(dish)) return plain as D;
    const key = edibleKey(dish);
    const at = (pct: number, source: Edible['source']) => {
      const scaled = scaleItem(plain, edibleGrams(grossG!, pct));
      return {
        ...scaled,
        kcal: round1(scaled.kcal),
        proteinG: round1(scaled.proteinG),
        fatG: round1(scaled.fatG),
        carbsG: round1(scaled.carbsG),
        edible: { grossG: grossG!, pct, source, key },
      } as D;
    };
    const picked = pickEdible(dish, own.get(key));
    if (picked) return at(picked.pct, picked.source);
    const pct = typeof ediblePct === 'number' ? ediblePct : null;
    const near = pct ?? 50;
    const guess = EDIBLE_STEPS.reduce(
      (best, p, j) =>
        Math.abs(p - near) < Math.abs(EDIBLE_STEPS[best]! - near) ? j : best,
      0,
    );
    if (!isFixed(dish))
      asked.push({
        dish: i,
        text: words.text,
        guess,
        options: EDIBLE_STEPS.map((p) => {
          const { name, grams, kcal, proteinG, fatG, carbsG, edible } = at(
            p,
            'ai',
          );
          return {
            label: words.pct(p),
            ...{ name, grams, kcal, proteinG, fatG, carbsG, edible },
          };
        }),
      });
    return at(EDIBLE_STEPS[guess]!, 'ai');
  });
  // The server's question goes first; the model's own question on that dish would contradict it.
  const askedDishes = new Set(asked.map((q) => q.dish));
  return {
    dishes: out,
    questions: [
      ...asked,
      ...questions.filter((q) => !askedDishes.has(q.dish)),
    ].slice(0, MAX_QUESTIONS),
  };
}
