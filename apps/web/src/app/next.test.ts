import { describe, expect, it } from 'vitest';
import { isPublicPath, loginHref, safeNext } from './next';

describe('safeNext', () => {
  it.each([
    ['/diary', '/diary'],
    ['/diary?date=2026-11-14', '/diary?date=2026-11-14'],
    ['/', '/'],
  ])('keeps the same-origin path %s', (raw, expected) => {
    expect(safeNext(raw)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    '',
    'diary',
    '//evil.example',
    '/\\evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    '/diary\nx',
    '/\tevil',
    '/diary\u007f',
  ])('falls back to / for %j', (raw) => {
    expect(safeNext(raw)).toBe('/');
  });
});

describe('loginHref', () => {
  it('carries the path in next and round-trips through safeNext', () => {
    const href = loginHref('/diary?date=2026-11-14');
    expect(href).toBe('/login?next=%2Fdiary%3Fdate%3D2026-11-14');
    const next = new URL(href, 'http://x').searchParams.get('next');
    expect(safeNext(next)).toBe('/diary?date=2026-11-14');
  });

  it('omits next for the home screen and flags an expired session', () => {
    expect(loginHref('/')).toBe('/login');
    expect(loginHref('/week', true)).toBe('/login?next=%2Fweek&expired=1');
  });
});

describe('isPublicPath', () => {
  it('matches sign-in screens only', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/invite')).toBe(true);
    expect(isPublicPath('/loginx')).toBe(false);
    expect(isPublicPath('/diary')).toBe(false);
  });
});
