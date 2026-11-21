import { describe, expect, it } from 'vitest';
import type { BarcodeLookup, Product } from './barcodes.js';
import { mergePackages, type PackageHintDish } from './merge.js';

const A = '4006381333931';
const B = '96385074';

const ai = (over: Partial<PackageHintDish> = {}): PackageHintDish => ({
  name: 'Yogurt',
  grams: 150,
  kcal: 120,
  proteinG: 5,
  fatG: 4,
  carbsG: 15,
  confidence: 0.7,
  ...over,
});

const product = (over: Partial<Product> = {}): Product => ({
  code: A,
  name: 'Greek yogurt 2%',
  brand: 'Dairy',
  kcal100: 70,
  protein100: 9,
  fat100: 2,
  carbs100: 4,
  per: 'g',
  servingG: 140,
  servingText: '140 g',
  ...over,
});

const hit = (
  code: string,
  p: Product | null,
  from: BarcodeLookup['from'] = p ? 'off' : null,
) => ({
  code,
  result: { product: p, from, off: p ? 'found' : 'missing' } as BarcodeLookup,
});

describe('mergePackages', () => {
  it('replaces the AI dish with a found product, own or OFF, at its serving', () => {
    for (const from of ['mine', 'off'] as const)
      expect(
        mergePackages([ai({ barcode: A })], [hit(A, product(), from)]),
      ).toEqual([
        {
          name: 'Greek yogurt 2%',
          grams: 140,
          kcal: 98,
          proteinG: 12.6,
          fatG: 2.8,
          carbsG: 5.6,
          unit: 'g',
          source: 'barcode',
          barcode: A,
          from,
        },
      ]);
  });

  it('AC-2: a product per ml gives a dish in ml over the AI unit, a plain AI dish keeps its unit', () => {
    const drink = product({ per: 'ml', servingG: 330 });
    const [barcode, label, check, plain] = mergePackages(
      [
        ai({ barcode: A, unit: 'g' }),
        ai({ barcode: B, label: true }),
        ai({ barcode: '5901234123457' }),
        ai({ unit: 'ml' }),
      ],
      [
        hit(A, drink),
        hit(B, { ...drink, code: B, kcal100: null }),
        hit('5901234123457', { ...drink, kcal100: null }),
      ],
    );
    expect(barcode).toMatchObject({ unit: 'ml', grams: 330 });
    expect(label).toMatchObject({ unit: 'ml', source: 'label' });
    expect(check).toMatchObject({ unit: 'ml', check: true });
    expect(plain).toMatchObject({ unit: 'ml', source: 'ai' });
  });

  it('takes 100 g for a product without a serving', () => {
    const [dish] = mergePackages(
      [ai({ barcode: A })],
      [hit(A, product({ servingG: null, protein100: null }))],
    );
    expect(dish).toMatchObject({ grams: 100, kcal: 70, proteinG: 0 });
  });

  it('AC-3.8: a known package weight gives the whole package, the last pick wins', () => {
    const merge = (over: Partial<Product>) =>
      mergePackages([ai({ barcode: A })], [hit(A, product(over))])[0];
    expect(merge({ packG: 400 })).toMatchObject({ grams: 400, kcal: 280 });
    expect(
      merge({ packG: 400, last: { mode: 'weight', value: 50 } }),
    ).toMatchObject({ grams: 50, kcal: 35 });
  });

  it('found without kcal and a label read → the label numbers', () => {
    expect(
      mergePackages(
        [ai({ barcode: A, label: true })],
        [hit(A, product({ kcal100: null }))],
      ),
    ).toEqual([
      {
        name: 'Greek yogurt 2%',
        grams: 150,
        kcal: 120,
        proteinG: 5,
        fatG: 4,
        carbsG: 15,
        unit: 'g',
        source: 'label',
        barcode: A,
      },
    ]);
  });

  it('found without kcal and no label → the AI estimate to check (E-12)', () => {
    expect(
      mergePackages([ai({ barcode: A })], [hit(A, product({ kcal100: null }))]),
    ).toEqual([
      expect.objectContaining({
        name: 'Greek yogurt 2%',
        kcal: 120,
        source: 'ai',
        barcode: A,
        confidence: 0.7,
        check: true,
      }),
    ]);
  });

  it('not found: a label read → label, otherwise a plain AI dish', () => {
    const [label, plain] = mergePackages(
      [ai({ barcode: A, label: true }), ai({ barcode: B })],
      [hit(A, null), hit(B, null)],
    );
    expect(label).toMatchObject({
      name: 'Yogurt',
      source: 'label',
      barcode: A,
    });
    expect(label).not.toHaveProperty('confidence');
    expect(plain).toEqual(
      expect.objectContaining({ source: 'ai', barcode: B, confidence: 0.7 }),
    );
    expect(plain).not.toHaveProperty('check');
  });

  it('keeps dishes without a package as they are, ref dropped', () => {
    expect(mergePackages([ai({ ref: null })], [])).toEqual([
      {
        name: 'Yogurt',
        grams: 150,
        kcal: 120,
        proteinG: 5,
        fatG: 4,
        carbsG: 15,
        unit: 'g',
        source: 'ai',
        barcode: null,
        confidence: 0.7,
      },
    ]);
  });

  it('adds a found product the AI gave no dish for, after the AI dishes', () => {
    const out = mergePackages([ai()], [hit(A, product())]);
    expect(out.map((d) => [d.source, d.barcode])).toEqual([
      ['ai', null],
      ['barcode', A],
    ]);
  });

  it('without AI: found products only, none for missing or kcal-less ones', () => {
    const out = mergePackages(
      [],
      [
        hit(A, product({ name: null, brand: null })),
        hit(B, product({ code: B, kcal100: null })),
        hit('0036000291452', null),
      ],
    );
    expect(out).toEqual([
      expect.objectContaining({ name: A, source: 'barcode', barcode: A }),
    ]);
  });

  it('one code twice gives one dish', () => {
    const out = mergePackages(
      [ai({ barcode: A }), ai({ barcode: A, name: 'Second' })],
      [hit(A, product()), hit(A, product())],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: 'barcode', barcode: A });
  });

  describe('printed digits differ from the decoder (ADR-0036 §4)', () => {
    const D = '4991433601383';
    const P = '8997035601383';
    const pocari = product({
      code: P,
      name: 'Pocari Ion Water 500ml',
      kcal100: 11,
      servingG: 500,
    });
    const printed = (p: Product | null) => ({ printed: hit(P, p) });

    it('AC-1: decoder code not found, printed found → the printed product, no hint', () => {
      const out = mergePackages(
        [ai({ barcode: D, ...printed(pocari) })],
        [hit(D, null)],
      );
      expect(out).toEqual([
        expect.objectContaining({
          name: 'Pocari Ion Water 500ml',
          grams: 500,
          kcal: 55,
          source: 'barcode',
          barcode: P,
          from: 'off',
        }),
      ]);
      expect(out[0]).not.toHaveProperty('alt');
    });

    it('no decoder code, printed found → the printed product', () => {
      expect(mergePackages([ai(printed(pocari))], [])).toEqual([
        expect.objectContaining({ source: 'barcode', barcode: P }),
      ]);
    });

    it('no decoder code, printed not found → as without it', () => {
      expect(mergePackages([ai(printed(null))], [])).toEqual(
        mergePackages([ai()], []),
      );
    });

    it('decoder found, printed not found → by the decoder, no hint', () => {
      expect(
        mergePackages(
          [ai({ barcode: D, ...printed(product({ kcal100: null })) })],
          [hit(D, product({ code: D }))],
        ),
      ).toEqual(
        mergePackages([ai({ barcode: D })], [hit(D, product({ code: D }))]),
      );
    });

    it('both found → by the decoder with the printed product as a hint', () => {
      const [dish] = mergePackages(
        [ai({ barcode: D, printed: hit(P, pocari, 'mine') })],
        [hit(D, product({ code: D }))],
      );
      expect(dish).toMatchObject({ source: 'barcode', barcode: D });
      expect(dish?.alt).toEqual({ code: P, product: pocari, from: 'mine' });
    });

    it('neither found → as now with a bare hint', () => {
      const [dish] = mergePackages(
        [ai({ barcode: D, label: true, ...printed(null) })],
        [hit(D, null)],
      );
      expect(dish).toMatchObject({ source: 'label', barcode: D });
      expect(dish?.alt).toEqual({ code: P, product: null });
    });

    it('one dish per code: a printed code already used is ignored', () => {
      const out = mergePackages(
        [ai(printed(pocari)), ai({ name: 'Water', ...printed(pocari) })],
        [],
      );
      expect(out.map((d) => [d.source, d.barcode])).toEqual([
        ['barcode', P],
        ['ai', null],
      ]);
    });
  });
});
