import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { AiTestPhoto } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { SET2_PHOTOS } from './fixtures';
import { dishLabel, parseExpected, TestPhotoList } from './TestPhotoList';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

const failed = (code: string): AiTestPhoto => ({
  file: 'banana.jpg',
  expected: 'banana; 70-160 kcal; exact',
  ms: 600,
  result: `error ${code}`,
});

it('shows a provider error in words and an unknown code as a dash', async () => {
  render(
    <I18nProvider>
      <TestPhotoList photos={[failed('ai_unavailable'), failed('nope_x')]} />
    </I18nProvider>,
  );
  const lines = await screen.findAllByText(/^Got/);
  const text = lines.map((l) => l.parentElement?.textContent);
  expect(text[0]).toContain('The AI provider is unavailable');
  expect(text[1]).toBe('Got: —');
  expect(document.body.textContent).not.toContain('ai_unavailable');
});

it('folds repeated dish names into × N in order of first appearance', () => {
  expect(dishLabel('egg, egg, egg')).toBe('egg × 3');
  expect(dishLabel('egg, egg, toast')).toBe('egg × 2, toast');
  expect(dishLabel('egg, toast, egg')).toBe('egg × 2, toast');
  expect(dishLabel('banana')).toBe('banana');
  expect(dishLabel('(none)')).toBeNull();
  // Set 2 writes the count out.
  expect(dishLabel('egg ×3, toast')).toBe('egg\u00a0×\u00a03, toast');
});

it('reads «Expected» of set 2 and of set 1 runs', () => {
  expect(parseExpected('egg ×3; 170-260 kcal; exact')).toMatchObject({
    name: 'egg\u00a0×\u00a03',
    min: 170,
    max: 260,
    per100: false,
    exact: true,
  });
  expect(parseExpected('sausage; 172-316 kcal/100 g; exact')).toMatchObject({
    name: 'sausage',
    min: 172,
    max: 316,
    per100: true,
  });
  expect(parseExpected('egg, egg; 150-300 kcal; notExact')).toMatchObject({
    name: 'egg\u00a0×\u00a02',
    exact: false,
  });
  expect(parseExpected('(none)')).toMatchObject({ name: null, empty: true });
});

const plain = (t?: string | null) => t?.replace(/[\u00a0\u2060]/g, ' ');

for (const [locale, failedWord, eggs, noodles, sausage, error] of [
  [
    'en',
    'Failed:',
    'egg: expected 3, got 1 · Calories out of range',
    'Not recognized: noodle, krupuk, sambal, acar, egg, vegetable · Calories out of range · Expected “approx.”',
    'Expected: sausage · 172 – 316 kcal/100 g · exact',
    'Provider error',
  ],
  [
    'ru',
    'Не прошло:',
    'egg: ожидалось 3 шт., получено 1 · Ккал вне диапазона',
    'Не узнано: noodle, krupuk, sambal, acar, egg, vegetable · Ккал вне диапазона · Ждали «примерно»',
    'Ожидалось: sausage · 172 – 316 ккал/100 г · точно',
    'Ошибка провайдера',
  ],
] as const) {
  it(`words every miss in order in ${locale}, after a hidden «${failedWord}»`, async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    render(
      <I18nProvider>
        <TestPhotoList photos={SET2_PHOTOS} />
      </I18nProvider>,
    );
    const rows = await screen.findAllByRole('listitem');
    const why = rows.map((r) =>
      plain(r.querySelector('.test-photos__why')?.textContent),
    );
    expect(why).toEqual([
      `${failedWord} ${eggs}`,
      `${failedWord} ${noodles}`,
      undefined,
      `${failedWord} ${error}`,
    ]);
    expect(rows[2]!.textContent).toContain(locale === 'en' ? 'ok' : 'ок');
    expect(plain(rows[2]!.textContent)).toContain(sausage);
  });
}

it('keeps the old reason for a set 1 run without misses', async () => {
  render(
    <I18nProvider>
      <TestPhotoList
        photos={[
          {
            file: 'salad.jpg',
            expected: 'salad; 150-650 kcal; notExact',
            got: 'salad',
            kcal: 900,
            levels: 'medium',
            ms: 4200,
            result: 'kcal 900 not in 150-650',
          },
        ]}
      />
    </I18nProvider>,
  );
  expect(
    (await screen.findByText(/Calories out of range/)).closest(
      '.test-photos__why',
    ),
  ).toBeTruthy();
});

it('words a case that expected a question and got none', async () => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'ru');
  render(
    <I18nProvider>
      <TestPhotoList
        photos={[
          {
            file: 'sapodilla-receipt.jpg',
            expected: 'sapodilla; 410-616 kcal; exact',
            got: 'Sapodilla',
            kcal: 513,
            levels: 'exact',
            ms: 3100,
            result: 'no question asked',
            misses: [{ code: 'no_question' }],
          },
        ]}
      />
    </I18nProvider>,
  );
  expect(
    (await screen.findByText(/Ждали вопрос/)).closest('.test-photos__why'),
  ).toBeTruthy();
});

it('words the grams and barcode misses of a raw-products case', async () => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'ru');
  render(
    <I18nProvider>
      <TestPhotoList
        photos={[
          {
            file: 'flour-package.jpg',
            expected: 'flour 800-1200 g; exact',
            got: 'Flour 500 g',
            kcal: 1820,
            ms: 2100,
            result: 'flour: 500 g out of range · flour: barcode not read',
            misses: [
              { code: 'grams', dish: 'flour', got: 500 },
              { code: 'barcode', dish: 'flour' },
            ],
          },
        ]}
      />
    </I18nProvider>,
  );
  const why = (await screen.findByText(/штрихкод не прочитан/)).closest(
    '.test-photos__why',
  );
  expect(why?.textContent).toContain(
    'flour: 500\u00a0г, вне диапазона · flour: штрихкод не прочитан',
  );
});

it('names the dishes the model returned in «Got», repeats as × N', async () => {
  render(
    <I18nProvider>
      <TestPhotoList
        photos={[
          {
            file: 'eggs.jpg',
            expected: 'egg, egg; 150-300 kcal; exact',
            got: 'boiled egg, boiled egg, toast',
            kcal: 78,
            levels: 'exact,exact,approx',
            ms: 900,
            result: 'ok',
          },
        ]}
      />
    </I18nProvider>,
  );
  const line = (await screen.findByText(/^Got/)).parentElement!;
  expect(plain(line.textContent)).toBe(
    'Got: boiled egg × 2, toast · 78 kcal · approx.',
  );
  expect(plain(line.getAttribute('title'))).toBe('boiled egg × 2, toast');
});

const chair: AiTestPhoto = {
  file: 'chair.jpg',
  expected: '(none)',
  got: '(none)',
  ms: 500,
  result: 'ok',
};

for (const [locale, word, alt] of [
  ['en', 'Not food', 'Test photo: Not food'],
  ['ru', 'Не еда', 'Эталонное фото: Не еда'],
] as const) {
  it(`names a photo without food "${word}" in ${locale}, for the eye and the screen reader`, async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    render(
      <I18nProvider>
        <TestPhotoList photos={[chair]} />
      </I18nProvider>,
    );
    expect(await screen.findByText(word)).toBeTruthy();
    expect(screen.getByAltText(alt)).toBeTruthy();
    expect(document.body.textContent).not.toContain('(none)');
  });
}
