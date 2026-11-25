import { describe, expect, it } from 'vitest';
import type { Product } from '../barcodes/barcodes.js';
import {
  ingredientsModelSchema,
  toIngredient,
  type IngredientModelRow,
} from './ingredients.js';

const row = (over: Partial<IngredientModelRow> = {}): IngredientModelRow => ({
  name: 'Flour',
  readValue: null,
  readUnit: null,
  weightFrom: null,
  estimateG: 300,
  pieces: null,
  unit: null,
  kcal100: 340,
  protein100: 10,
  fat100: 1,
  carbs100: 70,
  confidence: 0.8,
  barcode: null,
  printedBarcode: null,
  edibleRef: null,
  ediblePct: null,
  ...over,
});

const product: Product = {
  code: '4600000000008',
  name: 'Flour Extra',
  brand: null,
  kcal100: 350,
  protein100: 11,
  fat100: 1.5,
  carbs100: 72,
  per: 'g',
  servingG: null,
  servingText: null,
  packG: 1000,
};

describe('toIngredient (ADR-0040 §4)', () => {
  it('takes the scale weight first, nutrients per100 × grams', () => {
    const r = toIngredient(
      row({ weightFrom: 'scale', readValue: 250, readUnit: 'g' }),
      null,
    );
    expect(r).toEqual({
      name: 'Flour',
      grams: 250,
      kcal: 850,
      proteinG: 25,
      fatG: 2.5,
      carbsG: 175,
      per100: { kcal: 340, proteinG: 10, fatG: 1, carbsG: 70 },
      weight: 'scale',
      source: 'ai',
    });
  });

  it('converts kg, lb, oz and l', () => {
    const grams = (
      readValue: number,
      readUnit: IngredientModelRow['readUnit'],
    ) =>
      toIngredient(row({ weightFrom: 'package', readValue, readUnit }), null);
    expect(grams(0.5, 'kg')).toMatchObject({ grams: 500, weight: 'package' });
    expect(grams(1, 'lb')?.grams).toBe(453.6);
    expect(grams(8, 'oz')?.grams).toBe(226.8);
    expect(grams(1, 'l')).toMatchObject({ grams: 1000, unit: 'ml' });
  });

  it('falls back to the estimate when the read weight is out of 1–5000, and drops the row with none', () => {
    const big = row({ weightFrom: 'scale', readValue: 12, readUnit: 'kg' });
    expect(toIngredient(big, null)).toMatchObject({
      grams: 300,
      weight: 'estimate',
    });
    expect(toIngredient({ ...big, estimateG: 9000 }, null)).toBeNull();
    expect(toIngredient(row({ estimateG: null }), null)).toBeNull();
  });

  it('a found product gives the nutrients and, without a read weight, the whole package', () => {
    expect(toIngredient(row(), product)).toMatchObject({
      name: 'Flour Extra',
      grams: 1000,
      kcal: 3500,
      weight: 'barcode',
      source: 'barcode',
      barcode: product.code,
      product,
    });
    expect(toIngredient(row(), { ...product, packG: null })).toMatchObject({
      grams: 100,
      weight: 'barcode',
    });
  });

  it('a read weight beats the product amount', () => {
    const r = toIngredient(
      row({ weightFrom: 'scale', readValue: 200, readUnit: 'g' }),
      product,
    );
    expect(r).toMatchObject({
      grams: 200,
      kcal: 700,
      weight: 'scale',
      source: 'barcode',
    });
  });

  it('a barcode with a failed lookup is just the estimate', () => {
    expect(toIngredient(row({ barcode: product.code }), null)).toMatchObject({
      grams: 300,
      weight: 'estimate',
      source: 'ai',
    });
  });

  it('the model schema turns odd values into null and a missing list into an empty one', () => {
    expect(ingredientsModelSchema.parse({}).items).toEqual([]);
    const [r] = ingredientsModelSchema.parse({
      items: [
        { name: 'Milk', readUnit: 'Stone', weightFrom: 'SCALE', kcal100: 'x' },
      ],
    }).items;
    expect(r).toMatchObject({
      readUnit: null,
      weightFrom: 'scale',
      kcal100: null,
      barcode: null,
      pieces: null,
    });
  });

  it('keeps whole pieces only on an estimated weight', () => {
    expect(toIngredient(row({ pieces: 3 }), null)).toMatchObject({
      weight: 'estimate',
      pieces: 3,
    });
    for (const pieces of [null, 2.5, 0, 100]) {
      expect(toIngredient(row({ pieces }), null)).not.toHaveProperty('pieces');
    }
    const scale = row({
      pieces: 3,
      weightFrom: 'scale',
      readValue: 250,
      readUnit: 'g',
    });
    expect(toIngredient(scale, null)).not.toHaveProperty('pieces');
    expect(toIngredient(row({ pieces: 3 }), product)).not.toHaveProperty(
      'pieces',
    );
  });
});
