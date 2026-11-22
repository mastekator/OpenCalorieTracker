import { describe, expect, it, vi } from 'vitest';
import { packageModelSchema, type RecognizedDish } from '@oct/shared';
import { applyEdible, EDIBLE_PROMPT, edibleHints } from './edible.js';
import { recognizePrompt, sanitizeDish } from './recognize.js';
import { refinePrompt } from './refine.js';

// The model's own edible guess: 540 g at 0.83 kcal/g.
const sapodilla = {
  name: 'Sapodilla',
  grams: 540,
  kcal: 450,
  proteinG: 2.4,
  fatG: 6,
  carbsG: 108,
  confidence: 0.9,
  unit: 'g',
};

/** A model dish through the model schema and the sanitizer, as recognition does it. */
const dish = (d: Record<string, unknown>): RecognizedDish => {
  const [m] = packageModelSchema.parse({
    dishes: [{ ...sapodilla, ...d }],
  }).dishes;
  return { ...sanitizeDish(m!), ...edibleHints(m!) };
};
const apply = (
  dishes: RecognizedDish[],
  prefs = new Map<string, number>(),
  questions = [] as Parameters<typeof applyEdible>[0]['questions'],
) => applyEdible({ dishes, questions }, () => prefs, 'en');

it('both prompts carry the gross weight rules and the reference keys (ADR-0039 §2)', () => {
  expect(EDIBLE_PROMPT).toContain('sapodilla, ');
  expect(recognizePrompt('en')).toContain(EDIBLE_PROMPT);
  expect(refinePrompt('refine', false, 'en')).toContain(EDIBLE_PROMPT);
});

describe('applyEdible (ADR-0039 §3)', () => {
  it('a read gross weight and a reference key: edible grams by the reference, nutrients rescaled', () => {
    const [d] = apply([dish({ grossG: 772, edibleRef: 'sapodilla' })]).dishes;
    expect(d).toEqual({
      ...sapodilla,
      grams: 617.6,
      kcal: 514.7,
      proteinG: 2.7,
      fatG: 6.9,
      carbsG: 123.5,
      edible: { grossG: 772, pct: 80, source: 'ref', key: 'sapodilla' },
    });
  });

  it("the user's own share wins over the reference", () => {
    const prefs = vi.fn(() => new Map([['sapodilla', 70]]));
    const { dishes } = applyEdible(
      {
        dishes: [
          dish({ grossG: 772, edibleRef: 'sapodilla' }),
          sanitizeDish(sapodilla),
        ],
        questions: [],
      },
      prefs,
      'en',
    );
    expect(prefs).toHaveBeenCalledWith(['sapodilla']);
    expect(dishes[0]).toMatchObject({
      grams: 540.4,
      edible: { pct: 70, source: 'user', key: 'sapodilla' },
    });
  });

  it("outside the reference: the model's share, the key is the name key", () => {
    const [d] = apply([
      dish({ name: 'Mamey', grossG: 500, edibleRef: 'mamey', ediblePct: 70.4 }),
    ]).dishes;
    expect(d).toMatchObject({
      grams: 350,
      edible: { grossG: 500, pct: 70, source: 'ai', key: 'mamey' },
    });
  });

  it('no key and a low confidence: the server asks «How much is edible?» first, the nearest answer applied', () => {
    const model = {
      dish: 0,
      text: 'Ripe?',
      guess: 0,
      options: [],
    };
    const other = { ...model, dish: 1 };
    const { dishes, questions } = apply(
      [
        dish({ grossG: 400, ediblePct: 70, confidence: 0.3 }),
        sanitizeDish(sapodilla),
      ],
      new Map(),
      [model, other, other, other],
    );
    expect(dishes[0]).toMatchObject({
      grams: 300,
      edible: { grossG: 400, pct: 75, source: 'ai', key: 'sapodilla' },
    });
    expect(questions).toHaveLength(3);
    const [q] = questions;
    expect(q).toMatchObject({
      dish: 0,
      text: 'About how much is edible?',
      guess: 1,
    });
    expect(q!.options.map((o) => [o.label, o.grams, o.edible?.pct])).toEqual([
      ['90%', 360, 90],
      ['75%', 300, 75],
      ['50%', 200, 50],
      ['25%', 100, 25],
      ['10%', 40, 10],
    ]);
    // The model's own question on that dish is dropped.
    expect(questions.slice(1).map((x) => x.dish)).toEqual([1, 1]);
  });

  it('no share at all: 50 % is guessed; in Russian; a fixed dish is not asked', () => {
    const d = dish({ grossG: 400, edibleRef: null, ediblePct: null });
    const ru = applyEdible(
      { dishes: [d], questions: [] },
      () => new Map(),
      'ru',
    );
    expect(ru.dishes[0]!.grams).toBe(200);
    expect(ru.questions[0]).toMatchObject({
      text: 'Сколько примерно съедобно?',
      guess: 2,
    });
    expect(ru.questions[0]!.options[0]!.label).toBe('90\u00a0%');
    const fixed = applyEdible(
      { dishes: [d], questions: [] },
      () => new Map(),
      'en',
      () => true,
    );
    expect(fixed.questions).toEqual([]);
    expect(fixed.dishes[0]!.grams).toBe(200);
  });

  it('without a gross weight the dish stays as it was, with no `edible`', () => {
    const prefs = vi.fn(() => new Map());
    const plain = dish({ edibleRef: 'sapodilla', ediblePct: 80 });
    const { dishes } = applyEdible(
      { dishes: [plain], questions: [] },
      prefs,
      'en',
    );
    expect(dishes).toEqual([sanitizeDish(sapodilla)]);
    expect(prefs).not.toHaveBeenCalled();
  });

  it('garbage in the new fields does not fail the answer', () => {
    for (const bad of [
      { grossG: 'a lot', edibleRef: 7, ediblePct: {} },
      { grossG: 0 },
      { grossG: 9999, edibleRef: 'sapodilla' },
      { grossG: -5 },
    ])
      expect(apply([dish(bad)]).dishes).toEqual([sanitizeDish(sapodilla)]);
    // An unknown key and an impossible share end in the question.
    const { dishes, questions } = apply([
      dish({ grossG: 300, edibleRef: 'moon_fruit', ediblePct: 400 }),
    ]);
    expect(dishes[0]!.edible).toEqual({
      grossG: 300,
      pct: 90,
      source: 'ai',
      key: 'sapodilla',
    });
    expect(questions[0]!.guess).toBe(0);
    // A drink has no inedible part.
    expect(
      apply([dish({ grossG: 300, unit: 'ml' })]).dishes[0],
    ).not.toHaveProperty('edible');
  });
});
