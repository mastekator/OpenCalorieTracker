import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  mealItemInputSchema,
  mealPatchSchema,
  nameKey,
  uuid,
} from './meals.js';

describe('nameKey', () => {
  it('normalizes width, case and spaces, including non-breaking ones', () => {
    expect(nameKey('  Гречка С   Курицей\t')).toBe('гречка с курицей');
    expect(nameKey('ＰＬＯＶ')).toBe('plov');
  });
});

describe('mealItemInputSchema', () => {
  const item = {
    name: 'Rice',
    grams: 100,
    kcal: 130,
    proteinG: 2.7,
    fatG: 0.3,
    carbsG: 28,
    source: 'manual',
  };
  const ok = (patch: object) =>
    mealItemInputSchema.safeParse({ ...item, ...patch }).success;

  it('accepts 0.1..5000 g with one decimal (AC-3.4, AC-3.15)', () => {
    expect(ok({ grams: 283.5 })).toBe(true);
    expect(ok({ grams: 0.1 })).toBe(true);
    expect(ok({ grams: 5000 })).toBe(true);
    expect(ok({ grams: 0 })).toBe(false);
    expect(ok({ grams: 5000.1 })).toBe(false);
    expect(ok({ grams: 10.25 })).toBe(false);
  });

  it('takes recipeId only on a recipe portion (ADR-0023 §5)', () => {
    expect(ok({ source: 'recipe', recipeId: 3 })).toBe(true);
    expect(ok({ source: 'recipe' })).toBe(true);
    expect(ok({ source: 'manual', recipeId: 3 })).toBe(false);
    expect(ok({ source: 'recipe', recipeId: 0 })).toBe(false);
    expect(ok({ source: 'recipe', recipeId: 1.5 })).toBe(false);
  });

  it('takes confidence only from the AI', () => {
    expect(ok({ source: 'ai', confidence: 0.9 })).toBe(true);
    expect(ok({ confidence: 0.9 })).toBe(false);
  });
});

describe('mealPatchSchema', () => {
  it('needs the date and time fields together', () => {
    expect(mealPatchSchema.safeParse({ mealType: 'lunch' }).success).toBe(true);
    expect(
      mealPatchSchema.safeParse({ eatenAt: '2026-11-14T10:00:00Z' }).success,
    ).toBe(false);
    expect(
      mealPatchSchema.safeParse({
        eatenAt: '2026-11-14T10:00:00Z',
        tzOffsetMin: 180,
        localDate: '2026-11-14',
      }).success,
    ).toBe(true);
  });
});

describe('uuid', () => {
  it('makes distinct v4 UUIDs that the clientId schema accepts', () => {
    const a = uuid();
    expect(z.uuid().safeParse(a).success).toBe(true);
    expect(a[14]).toBe('4');
    expect(a).not.toBe(uuid());
  });
});
