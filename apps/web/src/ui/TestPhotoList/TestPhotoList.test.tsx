import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { AiTestPhoto } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { dishLabel, TestPhotoList } from './TestPhotoList';

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
  const plain = (t: string | null) => t?.replace(/\u00a0/g, ' ');
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
