import { describe, expect, it } from 'vitest';
import {
  checkCase,
  parseCases,
  readCases,
  type RefineCase,
} from './refine-cases.js';

const rice = {
  id: 'd1',
  name: 'Rice',
  grams: 150,
  kcal: 195,
  proteinG: 4,
  fatG: 0.5,
  carbsG: 42,
  fixed: ['grams'],
};
const raw = {
  name: 'rice',
  mode: 'refine',
  text: 'also noodles',
  dishes: [rice],
  expect: {
    dishes: [{ name: 'noodle', kcal: [200, 600] }],
    absent: ['soup'],
    kept: ['d1'],
    question: 'noodle',
  },
};
const [c] = parseCases([raw], ['salad.jpg']) as [RefineCase];
const dish = (name: string, grams: number, kcal: number, ref?: string) => ({
  name,
  grams,
  kcal,
  proteinG: 0,
  fatG: 0,
  carbsG: 0,
  confidence: 0.8,
  ref,
});
const good = {
  dishes: [dish('Rice', 150, 195, 'd1'), dish('Chicken noodles', 300, 450)],
  questions: [{ dish: 1, text: '?', guess: 0, options: [] }],
};

describe('parseCases', () => {
  it('accepts the real cases.json', async () => {
    expect((await readCases()).length).toBeGreaterThanOrEqual(8);
  });

  it('names the case on a bad mode, a missing text or an unknown photo', () => {
    expect(() => parseCases([{ ...raw, mode: 'x' }], [])).toThrow(/case rice/);
    expect(() => parseCases([{ ...raw, text: ' ' }], [])).toThrow(
      /refine needs a text/,
    );
    expect(() => parseCases([{ ...raw, photo: 'cat.jpg' }], [])).toThrow(
      /case rice: photo cat.jpg/,
    );
    expect(() =>
      parseCases([{ ...raw, expect: { absent: ['('] } }], []),
    ).toThrow(/regular expression/);
  });
});

describe('checkCase', () => {
  it('passes a matching answer', () => {
    expect(checkCase(c, good)).toBeNull();
  });

  it('names each kind of miss', () => {
    const miss = (
      dishes: ReturnType<typeof dish>[],
      questions = good.questions,
    ) => checkCase(c, { dishes, questions });
    expect(miss([dish('Rice', 150, 195, 'd1')])).toBe('no dish /noodle/');
    expect(miss([good.dishes[0]!, dish('Noodles', 300, 900)])).toBe(
      '/noodle/ out of range',
    );
    expect(miss([...good.dishes, dish('Soup', 300, 100)])).toBe(
      'unexpected /soup/',
    );
    expect(miss([dish('Rice', 200, 260, 'd1'), good.dishes[1]!])).toBe(
      'd1 not kept',
    );
    expect(miss(good.dishes, [])).toBe('question');
  });
});
