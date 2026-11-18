import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { RefineBar } from './RefineBar';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

const noop = () => {};
const base: ComponentProps<typeof RefineBar> = {
  value: '',
  onChange: noop,
  onRefine: noop,
  onCancel: noop,
};
const bar = (props: Partial<ComponentProps<typeof RefineBar>>) => (
  <I18nProvider>
    <RefineBar {...base} {...props} />
  </I18nProvider>
);

describe('RefineBar focus after a request', () => {
  it('moves to the result strip after a new result', async () => {
    const { rerender } = render(bar({ busy: 'busy' }));
    await screen.findByRole('status');
    rerender(bar({ result: { kcalDelta: 40, removed: [], onUndo: noop } }));
    const strip = await screen.findByRole('status');
    expect(document.activeElement).toBe(strip);
  });

  it('returns to the field after cancel, even with an older result', async () => {
    const result = { kcalDelta: 40, removed: [], onUndo: noop };
    const { rerender } = render(bar({ busy: 'busy', result }));
    await screen.findAllByRole('status');
    rerender(bar({ value: 'more rice', result }));
    const field = await screen.findByRole('textbox');
    expect(document.activeElement).toBe(field);
  });

  it('returns to the field after an error', async () => {
    const { rerender } = render(bar({ busy: 'slow' }));
    await screen.findByRole('status');
    rerender(bar({ value: 'more rice', error: <p>failed</p> }));
    const field = await screen.findByRole('textbox');
    expect(document.activeElement).toBe(field);
  });
});
