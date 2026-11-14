import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { API_VERSION } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';
import { ConfigProvider, useConfig } from './ConfigContext';

const config = {
  version: '1.0.0',
  apiVersion: API_VERSION,
  publicUrl: null,
  authMethods: ['password'],
  registration: 'invite',
  setupError: null,
};

function Child() {
  return <p>version {useConfig().version}</p>;
}

function renderProvider() {
  render(
    <I18nProvider>
      <ConfigProvider>
        <Child />
      </ConfigProvider>
    </I18nProvider>,
  );
}

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ConfigProvider', () => {
  it('offline shows 3.4 with a retry that loads the config again', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(Response.json(config));
    vi.stubGlobal('fetch', fetch);
    renderProvider();

    expect(
      await screen.findByText('First sign-in needs a connection'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('version 1.0.0')).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shows nothing for the first 300 ms of loading, then a skeleton', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderProvider();
    await act(() => vi.dynamicImportSettled()); // the dictionary chunk

    expect(screen.getByRole('main')).toBeTruthy();
    act(() => vi.advanceTimersByTime(299));
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(screen.getByRole('main').textContent).toBe('');
    act(() => vi.advanceTimersByTime(1));
    expect(document.querySelector('.skeleton')).not.toBeNull();
  });
});
