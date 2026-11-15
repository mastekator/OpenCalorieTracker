import { describe, expect, it } from 'vitest';
import { ILLUSTRATION_IDS } from '@oct/shared';
import sprite from '../../illustrations/sprite.svg?raw';

describe('illustration sprite', () => {
  it('fits 300 KB (AC-5.5)', () => {
    expect(new TextEncoder().encode(sprite).length).toBeLessThanOrEqual(
      300 * 1024,
    );
  });

  it('has a symbol for every illustration id and no others', () => {
    const ids = [...sprite.matchAll(/<symbol id="illo-([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(ids.sort()).toEqual([...ILLUSTRATION_IDS].sort());
  });

  it('paints only with --illo-* tokens', () => {
    expect(sprite).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
  });
});
