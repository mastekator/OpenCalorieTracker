import { describe, expect, it } from 'vitest';
import { unitOf, weightIn } from './weightUnits';

describe('weightIn (ADR-0038 §4)', () => {
  it('shows ml as fl oz and takes fl oz back to ml without drift', () => {
    const w = weightIn('us', 'ml');
    expect(w.show(500)).toBe(16.9);
    expect(w.toG(16.9)).toBe(499.8);
    expect(w.show(w.toG(16.9))).toBe(16.9);
  });

  it('keeps grams and metric ml as they are', () => {
    expect(weightIn('us').show(100)).toBe(3.5);
    expect(weightIn('metric', 'ml').show(500)).toBe(500);
    expect(weightIn('metric', 'ml').toG(250.04)).toBe(250);
  });

  it('reads anything but ml as grams', () => {
    expect(unitOf('ml')).toEqual({ unit: 'ml' });
    expect(unitOf('g')).toEqual({});
    expect(unitOf(undefined)).toEqual({});
    expect(unitOf('l')).toEqual({});
  });
});
