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
