import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { AiTestPhoto } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { TestPhotoList } from './TestPhotoList';

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
