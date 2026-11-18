import { describe, expect, it } from 'vitest';
import type { RecognizedDish } from '@oct/shared';
import {
  applyAgain,
  applyRefine,
  fixedOf,
  itemOf,
  toRequest,
  toRow,
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
