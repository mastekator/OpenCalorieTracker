import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { SourceBadge } from './SourceBadge';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

describe('SourceBadge (OCT-313 §2)', () => {
  it.each([
    ['barcode', 'barcode'],
    ['label', 'label'],
    ['mine', 'your product'],
  ] as const)('%s reads as a word with an icon', async (kind, word) => {
    const { container } = await renderLoaded(
      <I18nProvider>
        <SourceBadge kind={kind} />
      </I18nProvider>,
    );
    expect(container.textContent).toBe(word);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
