import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook, screen } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { OfflineBar, type BarVariant, useOnline } from './OfflineBar';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

const renderBar = async (variant: BarVariant | null) => {
  await renderLoaded(
    <I18nProvider>
      <OfflineBar variant={variant} />
    </I18nProvider>,
  );
  return screen.getByRole('status').textContent;
};

describe('OfflineBar', () => {
  it.each([
    ['offline', 'Offline · everything is saved on this device'],
    ['server', 'Server unavailable · everything is saved on this device'],
    ['updated', 'The app has been updated · please save again'],
    ['no_network', 'No connection'],
  ] as const)('shows the %s text', async (variant, text) => {
    expect(await renderBar(variant)).toBe(text);
  });

  it('keeps an empty live region when all is well', async () => {
    expect(await renderBar(null)).toBe('');
  });
});

describe('useOnline', () => {
  it('follows the online and offline events', () => {
    let online = true;
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => online,
    });
    const { result } = renderHook(useOnline);
    expect(result.current).toBe(true);
    act(() => {
      online = false;
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
  });
});
