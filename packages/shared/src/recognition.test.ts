import { describe, expect, it } from 'vitest';
import { confidenceLevel } from './recognition.js';

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
