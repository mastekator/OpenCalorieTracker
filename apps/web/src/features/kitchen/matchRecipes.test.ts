import { describe, expect, it } from 'vitest';
import type { Recipe } from '@oct/shared';
import { PILAF } from './fixtures';
import { matchRecipes, recipeFor } from './matchRecipes';

const r = (id: number, name: string, lastLoggedAt: string | null): Recipe => ({
  ...PILAF,
  id,
  name,
  lastLoggedAt,
  updatedAt: `2026-11-0${id}T00:00:00.000Z`,
});

const day = (d: number) =>
  `2026-11-${String(d).padStart(2, '0')}T12:00:00.000Z`;

describe('matchRecipes', () => {
  it('gives the 3 last logged before typing, never logged ones left out', () => {
    const list = [
      r(1, 'Pilaf', day(10)),
      r(2, 'Borscht', null),
      r(3, 'Syrniki', day(15)),
      r(4, 'Salad', day(12)),
      r(5, 'Soup', day(11)),
    ];
    expect(matchRecipes(list, '  ').map((x) => x.id)).toEqual([3, 4, 5]);
  });

  it('puts names starting with the query first, then the last logged', () => {
    const list = [
      r(1, 'Chicken pilaf', day(15)),
      r(2, 'Pilaf', day(10)),
      r(3, 'Lamb pilaf', null),
      r(4, 'Pilaf with quince', day(12)),
      r(5, 'Salad', day(16)),
    ];
    expect(matchRecipes(list, 'PIL').map((x) => x.id)).toEqual([4, 2, 1, 3]);
  });

  it('keeps two recipes with the same name', () => {
    const list = [r(1, 'Pilaf', day(10)), r(2, 'pilaf', day(12))];
    expect(matchRecipes(list, 'pilaf').map((x) => x.id)).toEqual([2, 1]);
  });
});

describe('recipeFor', () => {
  it('matches by nameKey, the last logged of several, then the last edited', () => {
    const list = [
      r(1, 'Pilaf', day(10)),
      r(2, ' pilaf ', day(12)),
      r(3, 'Pilaf', null),
      r(4, 'Salad', day(16)),
    ];
    expect(recipeFor(list, 'PILAF')?.id).toBe(2);
    expect(
      recipeFor([r(1, 'Pilaf', null), r(3, 'Pilaf', null)], 'pilaf')?.id,
    ).toBe(3);
    expect(recipeFor(list, 'Soup')).toBeUndefined();
  });
});
