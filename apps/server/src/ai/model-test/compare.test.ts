import { describe, expect, it } from 'vitest';
import { access, readdir, readFile } from 'node:fs/promises';
import {
  checkPhoto,
  compare,
  expectedFileSchema,
  expectedText,
  quantityOf,
  readExpected,
  TEST_PHOTOS_DIR,
  type Expected,
} from './compare.js';

const dish = (name: string, kcal: number, confidence = 0.96, grams = 100) => ({
  name,
  grams,
  kcal,
  proteinG: 0,
  fatG: 0,
  carbsG: 0,
  confidence,
});
const got = (...dishes: ReturnType<typeof dish>[]) => ({ dishes });

const eggs: Expected = {
  file: 'eggs.jpg',
  level: 'exact',
  ref: 215,
  dishes: [{ words: ['egg'], count: 3 }],
};
const pilaf: Expected = {
  file: 'pilaf.jpg',
  level: 'notExact',
  ref: 650,
  dishes: [{ words: ['pilaf', 'plov', 'osh'] }],
};
const noodles: Expected = {
  file: 'noodles.jpg',
  level: 'notExact',
  ref: 700,
  dishes: [
    { words: ['noodle', 'mie'] },
    { words: ['sambal', 'chili paste'] },
    { words: ['egg'] },
  ],
};
const sausages: Expected = {
  file: 'sausages.jpg',
  level: 'exact',
  per100: [191, 287],
  dishes: [{ words: ['sausage', 'hot dog'] }],
};
const chair: Expected = { file: 'chair.jpg', empty: true };
const codes = (e: Expected, r: ReturnType<typeof got>) =>
  compare(e, r).map((m) => m.code);

describe('compare', () => {
  it('passes three egg entries and one «3 eggs» entry (AC-3)', () => {
    const egg = dish('Boiled egg', 72);
    expect(compare(eggs, got(egg, egg, egg))).toEqual([]);
    expect(compare(eggs, got(dish('3 eggs', 215)))).toEqual([]);
    expect(compare(eggs, got(dish('Eggs ×3', 215)))).toEqual([]);
    expect(compare(eggs, got(dish('Three eggs', 215)))).toEqual([]);
  });

  it('fails «Chicken egg, raw» 215 kcal on three eggs: 1 of 3 (regression, E-4)', () => {
    expect(compare(eggs, got(dish('Chicken egg, raw', 215)))).toEqual([
      { code: 'count', dish: 'egg', expected: 3, got: 1 },
    ]);
    expect(compare(eggs, got(dish('Eggs', 215)))).toEqual([
      { code: 'count', dish: 'egg', expected: 3, got: 1 },
    ]);
  });

  it('matches from the start of a word only: eggplant is no egg (E-2)', () => {
    expect(compare(eggs, got(dish('Grilled eggplant', 215)))).toEqual([
      { code: 'not_recognized', dishes: ['egg'] },
    ]);
    expect(codes(eggs, got(dish('Egg-fried rice ×3', 215)))).toEqual([]);
  });

  it('takes synonyms, multi-word words, case and diacritics', () => {
    expect(codes(pilaf, got(dish('Uzbek PLOV', 600, 0.8)))).toEqual([]);
    expect(codes(pilaf, got(dish('Ōsh with lamb', 600, 0.8)))).toEqual([]);
    const accented: Expected = {
      ...pilaf,
      dishes: [{ words: ['Pilâf'] }],
    };
    expect(codes(accented, got(dish('pilaf', 600, 0.8)))).toEqual([]);
    expect(
      codes(
        noodles,
        got(
          dish('Fried noodles', 400, 0.8),
          dish('Chili paste', 50, 0.8),
          dish('Fried egg', 250, 0.8),
        ),
      ),
    ).toEqual([]);
  });

  it('fails «Mutton Biryani» on pilaf (regression)', () => {
    expect(compare(pilaf, got(dish('Mutton Biryani', 650, 0.8)))).toEqual([
      { code: 'not_recognized', dishes: ['pilaf'] },
    ]);
  });

  it('gives one entry to the first dish it names only (E-5, AC-1)', () => {
    expect(
      compare(noodles, got(dish('Noodles with egg and vegetables', 700, 0.8))),
    ).toEqual([{ code: 'not_recognized', dishes: ['sambal', 'egg'] }]);
  });

  it('lets extra dishes pass (AC-4)', () => {
    expect(
      codes(pilaf, got(dish('Plov', 550, 0.8), dish('Flatbread', 100, 0.8))),
    ).toEqual([]);
  });

  it('checks the kcal range from ref: ±20% exact, ±30% mixed (AC-9a)', () => {
    const egg = (kcal: number) => dish('egg', kcal);
    expect(codes(eggs, got(egg(58), egg(57), egg(57)))).toEqual([]); // 172
    expect(codes(eggs, got(egg(57), egg(57), egg(57)))).toEqual(['kcal']);
    expect(codes(eggs, got(egg(86), egg(86), egg(86)))).toEqual([]); // 258
    expect(codes(eggs, got(egg(86), egg(86), egg(87)))).toEqual(['kcal']);
    expect(codes(pilaf, got(dish('plov', 845, 0.8)))).toEqual([]);
    expect(codes(pilaf, got(dish('plov', 846, 0.8)))).toEqual(['kcal']);
  });

  it('checks the density of a pack per 100 g ±10% (AC-5a, E-7)', () => {
    expect(codes(sausages, got(dish('Sausages', 500, 0.96, 200)))).toEqual([]);
    expect(codes(sausages, got(dish('Sausage', 340, 0.96, 100)))).toEqual([
      'kcal',
    ]);
    // An extra dish is not checked, an entry without grams fails.
    expect(
      codes(
        sausages,
        got(dish('Hot dogs', 250, 0.96, 100), dish('Ketchup', 0, 0.96, 0)),
      ),
    ).toEqual([]);
    expect(codes(sausages, got(dish('Sausage', 250, 0.96, 0)))).toEqual([
      'kcal',
    ]);
  });

  it('checks the confidence level as before', () => {
    const egg = dish('egg', 72);
    expect(codes(eggs, got(egg, egg, dish('egg', 72, 0.9)))).toEqual(['exact']);
    expect(codes(pilaf, got(dish('plov', 650, 0.97)))).toEqual(['approx']);
  });

  it('returns every miss at once (AC-6)', () => {
    expect(
      compare(
        noodles,
        got(dish('Noodles', 2000, 0.97), dish('Egg', 100, 0.97)),
      ),
    ).toEqual([
      { code: 'not_recognized', dishes: ['sambal'] },
      { code: 'kcal' },
      { code: 'approx' },
    ]);
    expect(compare(eggs, got(dish('egg', 500, 0.5)))).toEqual([
      { code: 'count', dish: 'egg', expected: 3, got: 1 },
      { code: 'kcal' },
      { code: 'exact' },
    ]);
  });

  it('expects an empty list for non-food, some dishes for food', () => {
    expect(compare(chair, got())).toEqual([]);
    expect(compare(chair, got(dish('wood', 10, 0.3)))).toEqual([
      { code: 'empty' },
    ]);
    expect(compare(eggs, got())).toEqual([{ code: 'nothing' }]);
  });
});

describe('quantityOf', () => {
  it('reads digits and one–ten from the name, not weights', () => {
    expect(quantityOf('3 eggs')).toBe(3);
    expect(quantityOf('Eggs x3')).toBe(3);
    expect(quantityOf('two bananas')).toBe(2);
    expect(quantityOf('Egg 50 g')).toBe(1);
    expect(quantityOf('Egg, 1.5 servings')).toBe(1);
    expect(quantityOf('Toast')).toBe(1);
    expect(quantityOf('Stone fruit')).toBe(1);
  });
});

describe('checkPhoto', () => {
  it('writes the codes and all reasons in English through « · »', () => {
    const r = checkPhoto(eggs, got(dish('Chicken egg, raw', 500, 0.9)));
    expect(r.misses.map((m) => m.code)).toEqual(['count', 'kcal', 'exact']);
    expect(r.result).toBe(
      'egg: expected 3, got 1 · Calories out of range · not every dish is exact',
    );
    expect(checkPhoto(pilaf, got(dish('Biryani', 650, 0.8))).result).toBe(
      'Not recognized: pilaf',
    );
    expect(checkPhoto(chair, got())).toMatchObject({
      misses: [],
      result: 'ok',
    });
  });
});

describe('expectedText', () => {
  it('shows counts, the computed range and per 100 g for a pack', () => {
    expect(expectedText(eggs)).toBe('egg ×3; 172-258 kcal; exact');
    expect(expectedText(sausages)).toBe('sausage; 172-316 kcal/100 g; exact');
    expect(expectedText(noodles)).toBe(
      'noodle, sambal, egg; 490-910 kcal; notExact',
    );
    expect(expectedText(chair)).toBe('(none)');
  });
});

describe('expected.json', () => {
  it('rejects a broken file', () => {
    const ok = { set: 2, photos: [eggs] };
    expect(expectedFileSchema.safeParse(ok).success).toBe(true);
    for (const photos of [
      [{ ...eggs, ref: undefined }],
      [{ ...eggs, per100: [100, 200] }],
      [{ ...eggs, dishes: [] }],
      [{ ...eggs, dishes: [{ words: [] }] }],
      [{ ...eggs, kcal: [100, 200] }],
      [{ file: 'x.jpg', dishes: ['egg'], kcal: [1, 2], level: 'exact' }],
    ])
      expect(expectedFileSchema.safeParse({ set: 2, photos }).success).toBe(
        false,
      );
    expect(expectedFileSchema.safeParse([eggs]).success).toBe(false);
  });

  it('is set 2 and every photo is next to the server package', async () => {
    const { set, photos } = await readExpected();
    expect(set).toBe(2);
    for (const e of photos)
      await expect(
        access(new URL(e.file, TEST_PHOTOS_DIR)),
      ).resolves.toBeUndefined();
  });

  it('has no EXIF or XMP (APP1) in any photo', async () => {
    const files = (await readdir(TEST_PHOTOS_DIR)).filter((f) =>
      /\.jpe?g$/i.test(f),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const b = await readFile(new URL(f, TEST_PHOTOS_DIR));
      expect(b.readUInt16BE(0), f).toBe(0xffd8);
      // Walk the segments up to the image data (SOS); APP1 is FF E1.
      const markers: number[] = [];
      for (let i = 2; i + 4 <= b.length && b[i] === 0xff;) {
        const m = b[i + 1]!;
        if (m === 0xda) break;
        markers.push(m);
        i += 2 + b.readUInt16BE(i + 2);
      }
      expect(markers, f).not.toContain(0xe1);
    }
  });
});
