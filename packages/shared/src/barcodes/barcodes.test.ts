import { describe, expect, it } from 'vitest';
import { normalizeGtin } from './barcodes.js';

describe('normalizeGtin', () => {
  it('accepts valid EAN-13, EAN-8 and GTIN-14', () => {
    expect(normalizeGtin('4006381333931')).toBe('4006381333931');
    expect(normalizeGtin('96385074')).toBe('96385074');
    expect(normalizeGtin('10012345678902')).toBe('10012345678902');
  });

  it('pads UPC-A to 13 digits', () => {
    expect(normalizeGtin('036000291452')).toBe('0036000291452');
  });

  it('drops spaces and hyphens', () => {
    expect(normalizeGtin(' 4006381-333931 ')).toBe('4006381333931');
  });

  it('rejects a wrong check digit, length or characters', () => {
    expect(normalizeGtin('4006381333932')).toBeNull();
    expect(normalizeGtin('1234567')).toBeNull();
    expect(normalizeGtin('400638133393')).toBeNull();
    expect(normalizeGtin('40063813339x1')).toBeNull();
    expect(normalizeGtin('')).toBeNull();
  });
});
