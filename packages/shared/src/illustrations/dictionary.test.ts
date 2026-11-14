import { describe, expect, it } from 'vitest';
import {
  categoryIdOf,
  ILLUSTRATION_IDS,
  illustrationIdSchema,
  matchIllustration,
  mealIllustration,
  WORDS,
} from './dictionary.js';

// From docs/design/oct-33/dictionary.js: AC-3.7, word forms, E-6.2 and empty name (E-6.1).
const EXAMPLES = [
  ['Куриный суп', 'soup'],
  ['Салат с курицей', 'salad'],
  ['Овсянка с бананом', 'grains'],
  ['Chicken breast', 'poultry'],
  ['Борщ', 'soup'],
  ['Капучино', 'coffee'],
  ['Сырники', 'sweets'],
  ['Xyzzy', 'plate'],
  ['Бананом', 'fruit'],
  ['Bananas', 'fruit'],
  ['Курица, рис, салат, соус', 'salad'],
  ['Яйцо варёное, 2 шт', 'eggs'],
  ['Гречка с грибами', 'grains'],
  ['Кофе с молоком', 'coffee'],
  ['Картофель фри', 'fastfood'],
  ['Eggplant parmesan', 'vegetables'],
  ['Сырок глазированный', 'sweets'],
  ['Пельмени со сметаной', 'pasta'],
  ['Молочный коктейль', 'drinks'],
  ['Творог 5 %', 'dairy'],
  ['Вареники с вишней', 'pasta'],
  ['Печень куриная', 'meat'],
  ['Печенье овсяное', 'sweets'],
  ['Греческий салат', 'salad'],
  ['Греческий йогурт', 'dairy'],
  ['', 'plate'],
] as const;

describe('matchIllustration', () => {
  it.each(EXAMPLES)('%s → %s', (name, category) => {
    expect(categoryIdOf(matchIllustration(name))).toBe(category);
  });

  it('picks the specific item', () => {
    expect(matchIllustration('Борщ')).toBe('soup-borscht');
    expect(matchIllustration('Chicken breast')).toBe('poultry-breast');
    expect(matchIllustration('Сырники')).toBe('sweets-pancakes');
  });

  it('every WORDS key is a known id', () => {
    for (const id of Object.keys(WORDS)) expect(ILLUSTRATION_IDS).toContain(id);
    expect(ILLUSTRATION_IDS).toHaveLength(42);
    expect(illustrationIdSchema.safeParse('nope').success).toBe(false);
  });
});

describe('mealIllustration', () => {
  it('takes the dish with the most kcal, the first on a tie', () => {
    expect(
      mealIllustration([
        { illustration: 'salad', kcal: 100 },
        { illustration: 'meat', kcal: 300 },
        { illustration: 'fish', kcal: 300 },
      ]),
    ).toBe('meat');
    expect(mealIllustration([])).toBe('plate');
  });
});
