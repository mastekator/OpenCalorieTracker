import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  HIDE_MS,
  hideInstall,
  installPlatform,
  isInstallHidden,
  listenInstallPrompt,
  useInstallPrompt,
} from './install';

const IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const SAFARI = `${IOS} Version/18.0 Mobile/15E148 Safari/604.1`;
const IPAD =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const on = (ua: string, standalone = false, touchPoints = 5) =>
  installPlatform({ ua, standalone, touchPoints });

describe('installPlatform', () => {
  it.each([
    ['Safari on iPhone', SAFARI],
    ['Safari on iPadOS', IPAD],
  ])('%s gets the steps', (_, ua) => expect(on(ua)).toBe('safari'));

  it.each([
    ['CriOS', `${IOS} CriOS/131.0 Mobile/15E148 Safari/604.1`],
    ['FxiOS', `${IOS} FxiOS/133.0 Mobile/15E148 Safari/605.1.15`],
    [
      'EdgiOS',
      `${IOS} Version/18.0 EdgiOS/131.0 Mobile/15E148 Safari/605.1.15`,
    ],
    ['Instagram', `${IOS} Mobile/15E148 Instagram 300.0.0`],
    ['Facebook', `${IOS} Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]`],
    ['Telegram', `${IOS} Version/18.0 Mobile/15E148 Safari/604.1 Telegram-iOS`],
    ['a bare webview', `${IOS} Mobile/15E148`],
  ])('%s gets «Open in Safari»', (_, ua) =>
    expect(on(ua)).toBe('other-browser'),
  );

  it('nothing once installed', () => {
    expect(on(SAFARI, true)).toBe(null);
    expect(on(`${IOS} CriOS/131.0 Mobile/15E148`, true)).toBe(null);
  });

  it.each([
    [
      'Android Chrome',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
      5,
    ],
    ['desktop Safari', IPAD, 0],
    [
      'desktop Chrome',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
      0,
    ],
  ])('nothing on %s', (_, ua, touch) =>
    expect(on(ua, false, touch)).toBe(null),
  );
});

describe('30-day hide', () => {
  afterEach(() => localStorage.clear());
  const now = Date.UTC(2026, 10, 15);

  it('hides for 30 days, then shows again', () => {
    expect(isInstallHidden(now)).toBe(false);
    hideInstall(now);
    expect(isInstallHidden(now)).toBe(true);
    expect(isInstallHidden(now + HIDE_MS - 1)).toBe(true);
    expect(isInstallHidden(now + HIDE_MS)).toBe(false);
  });

  it('a broken value counts as not hidden', () => {
    localStorage.setItem('install-hint-hidden-at', 'soon');
    expect(isInstallHidden(now)).toBe(false);
  });
});

describe('useInstallPrompt', () => {
  it('keeps the event, prompts once, then drops it', async () => {
    listenInstallPrompt();
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);

    const event = Object.assign(
      new Event('beforeinstallprompt', { cancelable: true }),
      { prompt: vi.fn(async () => ({ outcome: 'dismissed' })) },
    );
    act(() => void dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.canInstall).toBe(true);

    await act(() => result.current.install());
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(result.current.canInstall).toBe(false);
  });
});
