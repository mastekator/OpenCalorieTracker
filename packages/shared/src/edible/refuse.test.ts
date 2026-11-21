import { describe, expect, it } from 'vitest';
import {
  EDIBLE_KEYS,
  REFUSE,
  edibleGrams,
  edibleOf,
  scaleDish,
} from './refuse.js';
import { oneDecimal } from '../meals.js';

describe('refuse reference', () => {
  it('has unique keys and edible shares in 10–100', () => {
    expect(new Set(REFUSE.map((r) => r.key)).size).toBe(REFUSE.length);
    for (const r of REFUSE) {
      expect(Number.isInteger(r.edible)).toBe(true);
      expect(r.edible).toBeGreaterThanOrEqual(10);
      expect(r.edible).toBeLessThanOrEqual(100);
      expect(r.key).toMatch(/^[a-z_]+$/);
    }
  });

  it('matches USDA SR Legacy values', () => {
    expect(edibleOf('banana')).toBe(64);
    expect(edibleOf('sapodilla')).toBe(80);
    expect(edibleOf('orange')).toBe(73);
    expect(edibleOf('walnut_in_shell')).toBe(45);
    expect(edibleOf('egg')).toBe(88);
    expect(edibleOf('unknown')).toBeUndefined();
  });

  it('lists every key for the prompt', () => {
    expect(EDIBLE_KEYS.split(', ')).toEqual(REFUSE.map((r) => r.key));
  });
});

describe('edibleGrams', () => {
  it('rounds to one decimal', () => {
    expect(edibleGrams(772, 80)).toBe(617.6);
    expect(edibleGrams(333, 64)).toBe(213.1);
    expect(oneDecimal(edibleGrams(123.4, 73))).toBe(true);
    expect(edibleGrams(500, 100)).toBe(500);
  });
});

describe('scaleDish', () => {
  it('keeps kcal and macros per gram', () => {
    const dish = {
      name: 'Sapodilla',
      grams: 772,
      kcal: 633,
      proteinG: 3.4,
      fatG: 8.5,
      carbsG: 154,
    };
    const s = scaleDish(dish, 617.6);
    expect(s.name).toBe('Sapodilla');
    expect(s.grams).toBe(617.6);
    expect(s.kcal / s.grams).toBeCloseTo(dish.kcal / dish.grams, 9);
    expect(s.proteinG / s.grams).toBeCloseTo(dish.proteinG / dish.grams, 9);
    expect(s.fatG / s.grams).toBeCloseTo(dish.fatG / dish.grams, 9);
    expect(s.carbsG / s.grams).toBeCloseTo(dish.carbsG / dish.grams, 9);
  });

  it('gives zeros for a zero-gram dish', () => {
    const s = scaleDish(
      { grams: 0, kcal: 10, proteinG: 1, fatG: 1, carbsG: 1 },
      50,
    );
    expect(s).toEqual({ grams: 50, kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 });
  });
});
