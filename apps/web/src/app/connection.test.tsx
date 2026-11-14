import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';
import { ToastProvider } from '../ui/Toast/Toast';
import { barVariant, useRequireOnline } from './connection';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('barVariant', () => {
  it.each([
    [true, false, false, null],
    [false, false, false, 'offline'],
    [false, true, true, 'offline'], // no network wins over everything
    [true, true, false, 'server'],
    [true, true, true, 'server'],
    [true, false, true, 'updated'],
  ] as const)(
    'online %s, server down %s, stale %s → %s',
    (online, down, stale, expected) => {
      expect(barVariant(online, down, stale)).toBe(expected);
    },
  );
});

describe('useRequireOnline', () => {
  const setOnline = (online: boolean) =>
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => online,
    });

  function Row({ action }: { action: () => void }) {
    const requireOnline = useRequireOnline();
    return (
      <button type="button" onClick={requireOnline('auth', action)}>
        Passkeys
      </button>
    );
  }

  const renderRow = async (action: () => void) => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    render(
      <I18nProvider>
        <ToastProvider>
          <Row action={action} />
        </ToastProvider>
      </I18nProvider>,
    );
    return screen.findByRole('button', { name: 'Passkeys' });
  };

  it('runs the action online', async () => {
    setOnline(true);
    const action = vi.fn();
    fireEvent.click(await renderRow(action));
    expect(action).toHaveBeenCalledOnce();
  });

  it('offline shows the reason instead of running the action', async () => {
    setOnline(false);
    const action = vi.fn();
    fireEvent.click(await renderRow(action));
    expect(action).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        'Passkeys and password can only be changed online',
      ),
    ).toBeTruthy();
    await act(async () => {}); // let the toast timers settle
  });
});
