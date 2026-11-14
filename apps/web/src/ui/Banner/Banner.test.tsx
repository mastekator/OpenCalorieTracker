import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { Banner } from './Banner';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

describe('Banner', () => {
  it('is an alert when danger, a status otherwise', async () => {
    render(
      <I18nProvider>
        <Banner tone="danger">failed</Banner>
        <Banner>note</Banner>
      </I18nProvider>,
    );
    expect((await screen.findByRole('alert')).textContent).toBe('failed');
    expect(screen.getByRole('status').textContent).toBe('note');
  });

  it('has a labelled close button only when closable', async () => {
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <Banner onClose={onClose}>note</Banner>
        <Banner>other</Banner>
      </I18nProvider>,
    );
    const buttons = await screen.findAllByRole('button', { name: 'Close' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
