import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { loadDict, translate, type Key } from '../../i18n/translate';
import { en } from '../../i18n/locales/en';
import { RecognitionState, recognitionSteps } from './RecognitionState';

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

describe('RecognitionState quota actions', () => {
  it('recalculation: a single «Back to the entry» that does not close', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    await loadDict('en');
    let back = 0;
    let closed = 0;
    const { getAllByRole } = await renderLoaded(
      <I18nProvider>
        <RecognitionState
          state="quota"
          photoUrl=""
          onRetry={noop}
          onManual={() => back++}
          onClose={() => closed++}
        />
      </I18nProvider>,
    );
    const buttons = getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Back to the entry']);
    fireEvent.click(buttons[0]!);
    expect(back).toBe(1);
    expect(closed).toBe(0);
  });

  it('new photo: «Enter manually» and «Close»', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    await loadDict('en');
    const { getAllByRole } = await renderLoaded(
      <I18nProvider>
        <RecognitionState
          state="quota"
          photoUrl=""
          onRetry={noop}
          onRetake={noop}
          onManual={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    expect(getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Enter manually',
      'Close',
    ]);
  });
});

describe('recognitionSteps', () => {
  const t = ((key: Key) => translate('en', en, key)) as Parameters<
    typeof recognitionSteps
  >[0];
  const codes = (off: 'down' | 'missing') => [
    { code: '4006381333931', result: { product: null, from: null, off } },
  ];

  it.each(['down', 'missing'] as const)(
    'without AI the OFF step (%s) says nothing about the label',
    (off) => {
      const steps = recognitionSteps(t, codes(off), 'none');
      expect(steps.map((s) => s.caption).join(' ')).not.toMatch(/label/i);
      expect(steps[1]!.mark).toBe('warn');
      expect(recognitionSteps(t, codes(off), 'run')[1]!.caption).toMatch(
        /reading the label/,
      );
    },
  );
});

describe('RecognitionState while the photo uploads (OCT-370)', () => {
  it('runs «Uploading the photo» first, the rest wait', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    await loadDict('en');
    const { getByRole } = await renderLoaded(
      <I18nProvider>
        <RecognitionState
          state="loading"
          uploading
          photoUrl=""
          onRetry={noop}
          onRetake={noop}
          onManual={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    const steps = getByRole('list', { name: 'Recognition steps' });
    expect(
      Array.from(steps.querySelectorAll('li'), (li) => li.textContent),
    ).toEqual([
      expect.stringMatching(/^Uploading the photo.*in progress/),
      expect.stringMatching(/^Barcode.*waiting/),
      expect.stringMatching(/^Open Food Facts.*waiting/),
      expect.stringMatching(/^AI reads the photo.*waiting/),
    ]);
  });
});
