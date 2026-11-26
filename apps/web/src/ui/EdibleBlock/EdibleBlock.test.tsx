import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { RowEdible } from '../../features/meals/refine';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { EdibleBlock } from './EdibleBlock';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

function Host() {
  const [edible, setEdible] = useState<RowEdible>({
    grossG: 772,
    pct: 80,
    source: 'ref',
    key: 'sapodilla',
  });
  return (
    <EdibleBlock
      edible={edible}
      name="Sapodilla"
      units="metric"
      onChange={setEdible}
    />
  );
}

describe('EdibleBlock share error (OCT-420 2.4)', () => {
  it('shows only the field and the error until the share is fixed', async () => {
    await renderLoaded(
      <I18nProvider>
        <Host />
      </I18nProvider>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /^Change the percentage/ }),
    );
    const input = screen.getByRole('textbox', { name: 'How much is edible' });
    const extras = () => ({
      net: screen.queryByText(/^edible · /),
      chips: screen.queryByRole('group', { name: 'Quick pick' }),
      hint: screen.queryByText(/Sapodilla/),
    });

    fireEvent.change(input, { target: { value: '0' } });
    expect(screen.getByRole('alert').textContent).toBe('10–100%');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(
      screen.getByRole('alert').id,
    );
    expect(extras()).toEqual({ net: null, chips: null, hint: null });

    fireEvent.change(input, { target: { value: '50' } });
    expect(screen.queryByRole('alert')).toBeNull();
    const back = extras();
    expect(back.net?.textContent).toMatch(/^edible · 386\sg$/);
    expect(back.chips).not.toBeNull();
    expect(back.hint).not.toBeNull();
  });
});
