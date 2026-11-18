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

describe('RefineBar while a request runs (OCT-282)', () => {
  it('says «Refining…», «Recognizing again…» or «Taking longer…» by mode', async () => {
    const { rerender } = render(bar({ busy: 'busy', mode: 'refine' }));
    expect((await screen.findByRole('status')).textContent).toContain(
      'Refining…',
    );
    rerender(bar({ busy: 'busy', mode: 'again' }));
    expect(screen.getByRole('status').textContent).toContain(
      'Recognizing again…',
    );
    rerender(bar({ busy: 'slow', mode: 'again' }));
    expect(screen.getByRole('status').textContent).toContain(
      'Taking longer than usual…',
    );
  });

  it('shows the sent text under the indicator, none for an empty one', async () => {
    const { rerender } = render(bar({ busy: 'busy', value: '  more rice ' }));
    expect((await screen.findByRole('status')).textContent).toContain(
      '«more rice»',
    );
    rerender(bar({ busy: 'busy', value: ' ' }));
    expect(document.querySelector('.refine__query')).toBeNull();
  });

  it('moves focus to «Cancel» on start and keeps it there when slow', async () => {
    const { rerender } = render(bar({ value: 'more rice' }));
    (await screen.findByRole('textbox')).focus();
    rerender(bar({ value: 'more rice', busy: 'busy' }));
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);
    document.body.focus();
    (document.activeElement as HTMLElement).blur();
    rerender(bar({ value: 'more rice', busy: 'slow' }));
    expect(document.activeElement).not.toBe(cancel);
  });
});

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
