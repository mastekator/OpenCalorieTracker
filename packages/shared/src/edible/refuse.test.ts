import { describe, expect, it } from 'vitest';
import { EDIBLE_KEYS, REFUSE, edibleGrams, edibleOf } from './refuse.js';
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
    expect(edibleOf('corn_on_cob')).toBe(55);
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
