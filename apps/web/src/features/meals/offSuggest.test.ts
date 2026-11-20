import { describe, expect, it } from 'vitest';
import type { OffStatus } from '@oct/shared';
import { showOffSuggest } from './offSuggest';

const codes = (...off: OffStatus[]) =>
  off.map((o) => ({
    code: '4006381333931',
    result: { product: null, from: null, off: o },
  }));
const now = new Date('2026-11-20T12:00:00Z');
const daysAgo = (d: number) =>
  new Date(now.getTime() - d * 86_400_000).toISOString();

describe('showOffSuggest', () => {
  it('a code with the lookup off, never asked → shown', () => {
    expect(showOffSuggest(codes('disabled'), null, now)).toBe(true);
    expect(showOffSuggest(codes('missing', 'disabled'), undefined, now)).toBe(
      true,
    );
  });

  it('«Not now» less than 30 days ago → hidden; 30 and more → shown again', () => {
    expect(showOffSuggest(codes('disabled'), daysAgo(29), now)).toBe(false);
    expect(showOffSuggest(codes('disabled'), daysAgo(30), now)).toBe(true);
    expect(showOffSuggest(codes('disabled'), daysAgo(31), now)).toBe(true);
  });

  it('the admin blocked outgoing requests → never', () => {
    expect(showOffSuggest(codes('blocked'), null, now)).toBe(false);
  });

  it('lookup on or no codes → never', () => {
    expect(showOffSuggest(codes('found', 'missing', 'down'), null, now)).toBe(
      false,
    );
    expect(showOffSuggest([], null, now)).toBe(false);
  });
});
