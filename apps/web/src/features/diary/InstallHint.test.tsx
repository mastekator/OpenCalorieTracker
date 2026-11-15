import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
import { isInstallHidden } from '../../app/install';
import { InstallHint } from './InstallHint';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const renderHint = (platform: 'safari' | 'other-browser' | null) =>
  render(
    <I18nProvider>
      <ToastProvider>
        <InstallHint platform={platform} />
      </ToastProvider>
    </I18nProvider>,
  );

describe('InstallHint', () => {
  it('shows nothing without an iPhone hint (other platforms, installed)', async () => {
    renderHint(null);
    await act(async () => {});
    expect(screen.queryByText('Add to your Home Screen')).toBe(null);
  });

  it('× hides the card for 30 days and points to Settings', async () => {
    renderHint('safari');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Hide the hint' }),
    );
    expect(screen.queryByText('Add to your Home Screen')).toBe(null);
    expect(isInstallHidden(Date.now())).toBe(true);
    await screen.findByText('You can install it later from Settings');
  });

  it('stays hidden after a reload within 30 days', async () => {
    localStorage.setItem('install-hint-hidden-at', String(Date.now()));
    renderHint('safari');
    await act(async () => {});
    expect(screen.queryByText('Add to your Home Screen')).toBe(null);
  });

  it('«How to install» opens the three steps', async () => {
    renderHint('safari');
    fireEvent.click(
      await screen.findByRole('button', { name: 'How to install' }),
    );
    screen.getByRole('heading', { name: 'Install on iPhone' });
    expect(screen.getAllByRole('listitem').length).toBe(5); // 3 steps + 2 reasons
  });

  it('other browsers copy the app address', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderHint('other-browser');
    fireEvent.click(
      await screen.findByRole('button', { name: 'How to install' }),
    );
    screen.getByRole('heading', { name: 'Open in Safari' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    await screen.findByText('Address copied');
    expect(writeText).toHaveBeenCalledWith(new URL('/', location.href).href);
  });

  it('a failed copy selects the address instead of claiming success', async () => {
    const writeText = vi.fn(async () => Promise.reject(new Error('denied')));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderHint('other-browser');
    fireEvent.click(
      await screen.findByRole('button', { name: 'How to install' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    await screen.findByText('The address is selected — copy it from the menu.');
    expect(screen.queryByText('Address copied')).toBe(null);
    expect(getSelection()?.toString()).toBe(new URL('/', location.href).href);
  });
});
