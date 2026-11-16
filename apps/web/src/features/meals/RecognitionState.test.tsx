import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { loadDict } from '../../i18n/translate';
import { RecognitionState } from './RecognitionState';

const noop = () => {};
const states = [
  'slow',
  'unavailable',
  'quota',
  'failed',
  'gone',
  'empty',
  'offline',
] as const;

afterEach(cleanup);

describe('RecognitionState when recalculating a saved meal', () => {
  // Recalculation has neither manual entry nor «Retake»: no text may call for them.
  it.each([
    ['en', /manual|retake|closer shot|shoot/i, 'The entry stays as it was.'],
    ['ru', /вручную|пересн|снимите/i, 'Запись осталась как была.'],
  ])(
    '%s: no manual entry or retake in any state',
    async (locale, banned, kept) => {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      await loadDict(locale as 'en' | 'ru');
      for (const state of states) {
        const { container } = await renderLoaded(
          <I18nProvider>
            <RecognitionState
              state={state}
              photoUrl=""
              onRetry={noop}
              onManual={noop}
              onClose={noop}
            />
          </I18nProvider>,
        );
        expect(container.textContent, state).not.toMatch(banned);
        if (state !== 'slow')
          expect(container.textContent, state).toContain(kept);
        cleanup();
      }
    },
  );
});
