import { describe, expect, it } from 'vitest';
import type { RecognizedDish } from '@oct/shared';
import { PILAF } from '../kitchen/fixtures';
import { CHEESECAKE, QUESTION_CASES } from './questions.fixtures';
import {
  answer,
  applyAgain,
  applyRefine,
  fixedOf,
  itemOf,
  requestDishes,
  shownQuestion,
  toRequest,
  toRow,
  toRows,
  type Row,
} from './refine';

const dish = (name: string, grams: number, kcal: number) => ({
  name,
  grams,
  kcal,
  proteinG: 10,
  fatG: 5,
  carbsG: 20,
});
const ai = (name: string, grams: number, kcal: number, ref?: string | null) =>
  ({ ...dish(name, grams, kcal), confidence: 0.8, ref }) as RecognizedDish;

const porridge = () =>
  toRow({ ...dish('Porridge', 250, 300), confidence: 0.9 });
const bread = () => toRow(dish('Bread', 40, 100), 'manual');
const usual = () => toRow(dish('Soup', 300, 150), 'history');

describe('fixedOf', () => {
  it('a manual and a «last time» dish are fixed whole, an AI one by its edits', () => {
    const edited: Row = { ...porridge(), fixed: ['grams'] };
    expect(fixedOf(bread())).toEqual(['name', 'grams', 'nutrients']);
    expect(fixedOf(usual())).toEqual(['name', 'grams', 'nutrients']);
    expect(fixedOf(porridge())).toEqual([]);
    expect(fixedOf(edited)).toEqual(['grams']);
  });

  it('an edited AI dish loses its confidence', () => {
    expect(itemOf(porridge()).confidence).toBe(0.9);
    expect(
      itemOf({ ...porridge(), fixed: ['name'] }).confidence,
    ).toBeUndefined();
  });
});

it('itemOf passes the barcode of a manual dish (AC-4.5)', () => {
  const row = toRow(
    { ...dish('Yogurt', 140, 92), barcode: '96385074' },
    'manual',
  );
  expect(itemOf(row).barcode).toBe('96385074');
  expect('barcode' in itemOf(bread())).toBe(false);
});

it('toRows keeps the source and code of a glued package, itemOf sends them', () => {
  const [found, ai] = toRows([
    {
      ...dish('Yogurt', 140, 98),
      source: 'barcode',
      barcode: '4607012345678',
    },
    { ...dish('Bread', 50, 130), confidence: 0.8, barcode: null },
  ]).map(itemOf);
  expect(found).toMatchObject({
    source: 'barcode',
    barcode: '4607012345678',
  });
  expect(found).not.toHaveProperty('confidence');
  expect(ai).toMatchObject({ source: 'ai', confidence: 0.8 });
  expect(ai).not.toHaveProperty('barcode');
});

describe('toRequest', () => {
  it('numbers the dishes d1…dN with the shown weight, one decimal', () => {
    const row = {
      ...porridge(),
      grams: 100,
      shown: 100,
      fixed: ['grams' as const],
    };
    expect(toRequest([row, bread()])).toEqual([
      {
        id: 'd1',
        name: 'Porridge',
        grams: 100,
        kcal: 120,
        proteinG: 4,
        fatG: 2,
        carbsG: 8,
        fixed: ['grams'],
      },
      {
        id: 'd2',
        ...dish('Bread', 40, 100),
        fixed: ['name', 'grams', 'nutrients'],
      },
    ]);
  });
});

describe('requestDishes', () => {
  const edited = (): Row => ({ ...porridge(), shown: 100, fixed: ['grams'] });
  const answered = (): Row => ({
    ...toRow(dish('Chicken', 80, 150)),
    fixed: ['name', 'grams', 'nutrients'],
  });

  it('«Recognize again» sends no AI dish, edited or answered; manual and «last time» go whole (OCT-289)', () => {
    const rows = [edited(), bread(), answered(), porridge(), usual()];
    expect(requestDishes('again', rows)).toEqual([
      {
        id: 'd1',
        ...dish('Bread', 40, 100),
        fixed: ['name', 'grams', 'nutrients'],
      },
      {
        id: 'd2',
        ...dish('Soup', 300, 150),
        fixed: ['name', 'grams', 'nutrients'],
      },
    ]);
  });

  it('«Recognize again» with only AI dishes sends an empty list', () => {
    expect(requestDishes('again', [edited(), answered(), porridge()])).toEqual(
      [],
    );
  });

  it('«Refine» sends every dish', () => {
    const rows = [edited(), bread(), porridge()];
    expect(requestDishes('refine', rows)).toEqual(toRequest(rows));
  });
});

describe('applyRefine', () => {
  it('keeps an untouched dish, marks a changed one and a new one, lists the dropped', () => {
    const rows = [porridge(), bread(), usual()];
    const res = applyRefine(rows, [
      ai('Porridge', 250, 300, 'd1'),
      ai('Bread', 60, 150, 'd2'),
      ai('Jam', 20, 50, null),
    ]);
    expect(res.rows[0]).toBe(rows[0]);
    expect(res.marks[rows[0]!.id]).toBeUndefined();
    const [, changed, added] = res.rows;
    expect(changed!.source).toBe('ai');
    // The AI changed the weight and numbers; the name the user typed stays theirs.
    expect(changed!.fixed).toEqual(['name']);
    expect(res.marks[changed!.id]).toEqual({
      kind: 'changed',
      name: 'Bread',
      grams: 40,
      kcal: 100,
    });
    expect(res.marks[added!.id]).toEqual({ kind: 'new' });
    expect(added!.fixed).toEqual([]);
    expect(res.removed).toEqual(['Soup']);
    expect(res.kcalDelta).toBe(150 + 50 - 100 - 150);
  });

  it('an unknown or repeated ref makes a new dish', () => {
    const rows = [porridge()];
    const res = applyRefine(rows, [
      ai('Porridge', 250, 300, 'd1'),
      ai('Porridge', 250, 300, 'd1'),
      ai('Tea', 200, 2, 'd7'),
    ]);
    expect(res.rows[0]).toBe(rows[0]);
    expect(res.rows.slice(1).map((r) => res.marks[r.id])).toEqual([
      { kind: 'new' },
      { kind: 'new' },
    ]);
    expect(res.removed).toEqual([]);
  });
});

describe('applyAgain', () => {
  it('replaces every AI dish, edited ones too, and keeps the user’s dishes', () => {
    const edited: Row = {
      ...porridge(),
      grams: 100,
      shown: 100,
      fixed: ['grams'],
    };
    const salad = toRow(dish('Salad', 150, 80));
    const rows = [edited, bread(), salad, usual()];
    const res = applyAgain(rows, [
      ai('porridge ', 250, 300),
      ai('Tea', 200, 2),
    ]);
    expect(res.rows.map((r) => r.original.name)).toEqual([
      'Bread',
      'Soup',
      'porridge ',
      'Tea',
    ]);
    expect(res.rows.slice(0, 2)).toEqual([rows[1], rows[3]]);
    const [, , again, tea] = res.rows;
    expect(again!.fixed).toEqual([]);
    expect(res.marks[again!.id]).toEqual({
      kind: 'changed',
      name: 'Porridge',
      grams: 100,
      kcal: 120,
    });
    expect(res.marks[tea!.id]).toEqual({ kind: 'new' });
    expect(res.removed).toEqual(['Salad']);
    expect(res.kcalDelta).toBe(300 + 2 - 120 - 80);
  });

  it('the same dish with the same numbers has no mark', () => {
    const res = applyAgain([porridge()], [ai('Porridge', 250, 300)]);
    expect(res.marks).toEqual({});
    expect(res.removed).toEqual([]);
  });
});

describe('questions', () => {
  const { k1, k2, k4k5 } = QUESTION_CASES;

  it('go onto their dish by index; a bad index or guess is dropped', () => {
    const rows = toRows(k4k5.dishes, [
      ...k4k5.questions,
      { ...k4k5.questions[0]!, dish: 7 },
    ]);
    expect(rows.map((r) => r.question?.text)).toEqual([
      'How was it cooked?',
      undefined,
      'What’s in the coffee?',
    ]);
    expect(
      toRows(k1.dishes, [{ ...k1.questions[0]!, guess: 9 }])[0]!.question,
    ).toBeUndefined();
  });

  it('an answer takes the option locally: fixed whole, marked, the total shifts', () => {
    const rows = toRows(k1.dishes, k1.questions);
    const res = answer(rows, rows[0]!.id, 1);
    const row = res.rows[0]!;
    expect(row.original.name).toBe('Vegetable salad with yogurt');
    expect(row.question?.chosen).toBe(1);
    expect(res.marks[row.id]).toEqual({
      kind: 'changed',
      name: 'Vegetable salad with mayo',
      grams: 250,
      kcal: 260,
    });
    expect(res.kcalDelta).toBe(110 - 260);
    expect(res.rows[1]).toBe(rows[1]);
    // Saved as an AI dish the user corrected: no confidence (ADR-0020 §3).
    expect(itemOf(row)).toEqual({
      name: 'Vegetable salad with yogurt',
      grams: 250,
      kcal: 110,
      proteinG: 5,
      fatG: 4,
      carbsG: 11,
      source: 'ai',
    });
    expect(fixedOf(row)).toEqual(['name', 'grams', 'nutrients']);
  });

  it('the answer can be switched; a weight after it scales the chosen option (E-10.b)', () => {
    const rows = toRows(k2.dishes, k2.questions);
    const id = rows[0]!.id;
    const pumpkin = answer(rows, id, 1).rows;
    expect(pumpkin[0]!.shown).toBe(220);
    const carrot = answer(pumpkin, id, 2);
    expect(carrot.rows[0]!.original.name).toBe('Baked carrot');
    expect(carrot.kcalDelta).toBe(80 - 57);
    const heavier = { ...carrot.rows[0]!, grams: 400, shown: 400 };
    expect(itemOf(heavier).kcal).toBe(160);
  });

  it('a weight set by hand stays, the option follows it', () => {
    const [row] = toRows(k2.dishes, k2.questions);
    const set: Row = { ...row!, grams: 100, shown: 100, fixed: ['grams'] };
    const pumpkin = answer([set], set.id, 1).rows;
    expect(pumpkin[0]!.shown).toBe(100);
    expect(itemOf(pumpkin[0]!).kcal).toBeCloseTo(57 / 2.2);
    expect(answer(pumpkin, set.id, 2).rows[0]!.shown).toBe(100);
  });

  it("a guess with other grams than the dish's still takes the tapped option's weight", () => {
    const [q] = k2.questions;
    const off = {
      ...q!,
      options: q!.options.map((o, i) => (i ? o : { ...o, grams: 230 })),
    };
    const [row] = toRows(k2.dishes, [off]);
    expect(answer([row!], row!.id, 1).rows[0]!.shown).toBe(220);
  });

  it('another name drops the picture picked for the old one', () => {
    const [row] = toRows(k2.dishes, k2.questions);
    const picked: Row = {
      ...row!,
      original: { ...row!.original, illustration: 'cake' as never },
    };
    expect(
      answer([picked], picked.id, 1).rows[0]!.original.illustration,
    ).toBeUndefined();
  });

  it('a new answer brings its own questions, the old ones go', () => {
    const rows = toRows(k4k5.dishes, k4k5.questions);
    const again = applyAgain(rows, k1.dishes as never, k1.questions);
    expect(again.rows.map((r) => r.question?.text)).toEqual([
      'What’s the salad dressing?',
      undefined,
    ]);
    const kept = applyRefine(
      rows,
      k4k5.dishes.map((dish, i) => ({ ...dish, ref: `d${i + 1}` })),
    );
    expect(kept.rows.every((r) => !r.question)).toBe(true);
  });
});

describe('a recipe option (ADR-0035 §6)', () => {
  const { k7 } = QUESTION_CASES;
  const rows = () => toRows(k7.dishes, k7.questions);

  it('makes the dish a portion of the recipe at its weight, saved with the link', () => {
    const before = rows();
    const res = answer(before, before[0]!.id, 0, CHEESECAKE);
    const row = res.rows[0]!;
    // 150 g × 160 kcal/100 g, not the option's 400 kcal.
    expect(itemOf(row)).toEqual({
      name: 'My cheesecake',
      grams: 150,
      kcal: 240,
      proteinG: 13.95,
      fatG: 12,
      carbsG: 19.95,
      source: 'recipe',
      recipeId: 10,
    });
    expect(res.kcalDelta).toBe(240 - 480);
    expect(res.marks[row.id]).toMatchObject({
      kind: 'changed',
      name: 'My cheesecake',
      kcal: 480,
    });
    // A weight edit recalculates from the recipe.
    expect(itemOf({ ...row, grams: 300, shown: 300 }).kcal).toBe(480);
  });

  it('a recipe with ingredients: kcal per 100 g of its cooked weight', () => {
    const q = {
      ...k7.questions[0]!,
      options: [
        { ...k7.questions[0]!.options[0]!, recipeId: PILAF.id },
        k7.questions[0]!.options[1]!,
      ],
    };
    const [row] = toRows(k7.dishes, [q]);
    const res = answer([row!], row!.id, 0, PILAF);
    // 3 487 kcal over 2 100 g cooked.
    expect(itemOf(res.rows[0]!).kcal).toBeCloseTo((3487 / 2100) * 150);
    expect(res.rows[0]!.original.name).toBe('Homemade pilaf');
  });

  it('keeps a weight set by hand', () => {
    const [row] = rows();
    const set: Row = { ...row!, grams: 200, shown: 200, fixed: ['grams'] };
    expect(itemOf(answer([set], set.id, 0, CHEESECAKE).rows[0]!).kcal).toBe(
      320,
    );
  });

  it('switching back to the guess gives the AI dish without the link', () => {
    const before = rows();
    const id = before[0]!.id;
    const recipe = answer(before, id, 0, CHEESECAKE).rows;
    const back = answer(recipe, id, 1).rows[0]!;
    expect(back.source).toBe('ai');
    expect(back.recipeId).toBeUndefined();
    expect(itemOf(back)).toMatchObject({
      name: 'Cheesecake',
      grams: 150,
      kcal: 480,
    });
  });

  it('without its recipe the option does nothing', () => {
    const before = rows();
    expect(answer(before, before[0]!.id, 0).rows).toEqual(before);
  });
});

describe('shownQuestion', () => {
  const { k1, k7 } = QUESTION_CASES;
  const [row] = toRows(k7.dishes, k7.questions);

  it('names a recipe option by the local recipe, indices map back', () => {
    const renamed = { ...CHEESECAKE, name: 'Grandma’s cheesecake' };
    expect(shownQuestion(row!, [renamed])).toEqual({
      text: 'Is it your recipe?',
      options: [
        { label: 'Grandma’s cheesecake', recipe: renamed },
        { label: 'Regular cheesecake' },
      ],
      at: [0, 1],
      guess: 1,
      chosen: undefined,
    });
  });

  it('a deleted recipe hides its option, and a question left with one (E-2.b)', () => {
    expect(shownQuestion(row!, [])).toBeNull();
    const three = {
      ...k7.questions[0]!,
      guess: 2,
      options: [...k7.questions[0]!.options, k1.questions[0]!.options[0]!],
    };
    const [r] = toRows(k7.dishes, [three]);
    expect(shownQuestion(r!, [])).toMatchObject({ at: [1, 2], guess: 1 });
  });

  it('drops the recipe «Your recipe» already offers (AC-2.6)', () => {
    expect(
      shownQuestion({ ...row!, recipe: CHEESECAKE }, [CHEESECAKE]),
    ).toBeNull();
  });

  it('keeps the tapped option even after its recipe is gone', () => {
    const answered = answer([row!], row!.id, 0, CHEESECAKE).rows[0]!;
    expect(shownQuestion(answered, [])).toMatchObject({
      options: [{ label: 'My cheesecake' }, { label: 'Regular cheesecake' }],
      chosen: 0,
    });
  });

  it('a plain question is shown as is', () => {
    const [plain] = toRows(k1.dishes, k1.questions);
    expect(shownQuestion(plain!, [])?.at).toEqual([0, 1, 2, 3]);
  });
});
