import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { ConfidenceBadge } from './ConfidenceBadge';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

describe('ConfidenceBadge (AC-2.8)', () => {
  it.each([
    [0.97, 'Confidence: exact', 'exact'],
    [0.6, 'Confidence: medium', 'approx.'],
    [0.2, 'Confidence: low, check it', 'check'],
  ])('shows %f as a word', async (confidence, name, word) => {
    await renderLoaded(
      <I18nProvider>
        <ConfidenceBadge source="ai" confidence={confidence} />
      </I18nProvider>,
    );
    expect(screen.getByRole('img', { name }).textContent).toBe(word);
  });

  it('shows no badge for high confidence but reads it out', async () => {
    const { container } = await renderLoaded(
      <I18nProvider>
        <ConfidenceBadge source="ai" confidence={0.85} />
      </I18nProvider>,
    );
    expect(container.querySelector('.badge')).toBeNull();
    screen.getByText('Confidence: high');
  });

  it('shows nothing once an AI dish was edited', async () => {
    const { container } = await renderLoaded(
      <I18nProvider>
        <ConfidenceBadge source="ai" />
      </I18nProvider>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('marks manual and history dishes', async () => {
    await renderLoaded(
      <I18nProvider>
        <ConfidenceBadge source="manual" />
      </I18nProvider>,
    );
    screen.getByText('manual');
    cleanup();
    await renderLoaded(
      <I18nProvider>
        <ConfidenceBadge source="history" />
      </I18nProvider>,
    );
    screen.getByText('as last time');
  });
});
