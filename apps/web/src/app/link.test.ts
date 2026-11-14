import { describe, expect, it } from 'vitest';
import { isInAppBrowser, linkProblem } from './link';

describe('linkProblem', () => {
  it('is null for a valid link of the route’s kind', () => {
    expect(linkProblem('invite', { kind: 'invite', status: 'valid' })).toBe(
      null,
    );
    expect(linkProblem('recovery', { kind: 'recovery', status: 'valid' })).toBe(
      null,
    );
  });

  it.each([
    ['invite', 'expired', 'link.expired', 'link.ask_admin'],
    ['invite', 'invalid', 'link.invalid', 'link.ask_admin'],
    ['invite', 'used', 'link.used', 'link.used_body'],
    ['recovery', 'expired', 'link.recovery.expired', 'link.recovery.ask_admin'],
    ['recovery', 'invalid', 'link.recovery.invalid', 'link.recovery.ask_admin'],
    ['recovery', 'used', 'link.recovery.used', 'link.used_body'],
  ] as const)('%s %s → %s', (route, status, title, body) => {
    expect(linkProblem(route, { kind: route, status })).toEqual({
      title,
      body,
    });
  });

  it('reads an invalid token (kind null) as invalid', () => {
    expect(
      linkProblem('invite', { kind: null, status: 'invalid' })?.title,
    ).toBe('link.invalid');
  });

  it('reads a link of the other kind as invalid, whatever its status (E-4.4)', () => {
    expect(
      linkProblem('invite', { kind: 'recovery', status: 'valid' })?.title,
    ).toBe('link.invalid');
    expect(
      linkProblem('recovery', { kind: 'invite', status: 'used' })?.title,
    ).toBe('link.recovery.invalid');
  });
});

describe('isInAppBrowser', () => {
  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Telegram-iOS',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
  ])('detects %s', (ua) => expect(isInAppBrowser(ua)).toBe(true));

  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  ])('leaves a regular browser alone: %s', (ua) =>
    expect(isInAppBrowser(ua)).toBe(false),
  );
});
