import { describe, expect, it } from 'vitest';
import { confidenceLevel } from './recognition.js';
import { questionMatters } from './refine.js';

describe('confidenceLevel', () => {
  it.each([
    [1, 'exact'],
    [0.95, 'exact'],
    [0.9499, 'high'],
    [0.8, 'high'],
    [0.7999, 'medium'],
    [0.5, 'medium'],
    [0.4999, 'low'],
    [0, 'low'],
  ] as const)('%d → %s', (c, level) => {
    expect(confidenceLevel(c)).toBe(level);
  });
});

describe('questionMatters', () => {
  it.each([
    [300, 350, true], // +50 kcal
    [300, 340, false], // +40 kcal, 13 %
    [100, 115, true], // 15 %
    [100, 114, false],
    [0, 10, true], // any change from zero
    [0, 0, false], // same kcal never counts
    [300, 300, false],
  ])('%d → %d: %s', (dish, option, matters) => {
    expect(questionMatters({ kcal: dish }, { kcal: option })).toBe(matters);
  });
});
