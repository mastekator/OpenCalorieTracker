import type { ReactElement } from 'react';
import { act, render } from '@testing-library/react';
import { loadDict } from './i18n/translate';

/**
 * Renders a tree under I18nProvider (locale 'en') and waits for the dictionary
 * inside act, so the children's commit and effects (window listeners, store
 * subscriptions) are flushed before the test dispatches events. findBy* only
 * waits for the DOM, and the effects may still be pending on a slow runner.
 */
export async function renderLoaded(ui: ReactElement) {
  const result = render(ui);
  await act(() => loadDict('en'));
  return result;
}
