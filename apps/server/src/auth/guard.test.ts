import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientIp } from '../http/client-ip.js';
import { setCookie, testApp } from '../test/app.js';
import { ensureAdmin } from './admin.js';
import { DEVICE_FAILS, IP_FAILS, STALE_AFTER, TIMEOUT } from './guard.js';

const ADMIN = 'admin@example.com';
const PASSWORD = 'Correct-horse-battery-9';
const IP = '203.0.113.7';

async function setup() {
  const t = testApp();
  await ensureAdmin(t.config, t.db);
  /** A browser: keeps the device cookie it is given, unless `cookies` is false. */
  const browser = (ip = IP, cookies = true) => {
    let jar = '';
    const request = async (method: string, path: string, body?: unknown) => {
      const res = await t.app.request(path, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': ip,
          'user-agent': 'TestBrowser',
          cookie: jar,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const device = setCookie(res, 'oct_device');
      if (cookies && device) jar = device.split(';')[0]!;
      return res;
    };
    const login = async (password = PASSWORD, email = ADMIN) => {
      const res = await request('POST', '/api/auth/login', { email, password });
      const session = setCookie(res, 'oct_session');
      return { res, session: session?.split(';')[0], body: await res.json() };
    };
    return {
      request,
      login,
      fail: (times = 1) =>
        (async () => {
          for (let i = 0; i < times; i++) await login('Wrong-pass-1');
        })(),
      get cookie() {
        return jar;
      },
    };
  };
  const rows = () =>
    t.db
      .prepare(
        'SELECT kind, ip, device_id, fail_count, timeout_count, blocked_at IS NOT NULL AS blocked FROM login_guards ORDER BY kind',
      )
      .all();
  return { ...t, browser, rows };
}

let start: number;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  start = Date.now();
});
afterEach(() => vi.useRealTimers());
const at = (ms: number) => vi.setSystemTime(start + ms);

describe('device cookie (AC-5.6)', () => {
  it('is issued once, for 400 days, with the session cookie attributes', async () => {
    const { browser } = await setup();
    const b = browser();
    const first = await b.request('GET', '/api/config');
    expect(setCookie(first, 'oct_device')).toMatch(
      /^oct_device=[\w-]{22}; Max-Age=34560000; Path=\/; HttpOnly; SameSite=Strict$/,
    );
    expect(
      setCookie(await b.request('GET', '/api/config'), 'oct_device'),
    ).toBeUndefined();
  });

  it('replaces a value the server could not have issued', async () => {
    const { app } = await setup();
    const res = await app.request('/api/config', {
      headers: { cookie: 'oct_device=../../etc' },
    });
    expect(setCookie(res, 'oct_device')).toMatch(/^oct_device=[\w-]{22};/);
  });

  it('is renewed on sign-in', async () => {
    const { browser } = await setup();
    const b = browser();
    await b.request('GET', '/api/config');
    const { res } = await b.login();
    expect(setCookie(res, 'oct_device')?.split(';')[0]).toBe(b.cookie);
  });
});

describe('device timeout and block', () => {
  it(`times the pair out after ${DEVICE_FAILS} failures and ignores attempts meanwhile (AC-5.7)`, async () => {
    const { browser, rows } = await setup();
    const b = browser();
    await b.request('GET', '/api/config');
    await b.fail(DEVICE_FAILS - 1);
    expect((await b.login('Wrong-pass-1')).res.status).toBe(401);

    at(60_000);
    const blocked = await b.login();
    expect(blocked.res.status).toBe(429);
    expect(blocked.body).toEqual({
      error: {
        code: 'too_many_attempts',
        details: { retryAfterSec: (TIMEOUT - 60_000) / 1000 },
      },
    });
    const before = rows();
    await b.fail(3);
    expect(rows()).toEqual(before);

    at(TIMEOUT);
    expect((await b.login()).res.status).toBe(200);
  });

  it('lets another device on the same IP sign in (E-5.5)', async () => {
    const { browser } = await setup();
    const bad = browser();
    await bad.request('GET', '/api/config');
    await bad.fail(DEVICE_FAILS);
    expect((await bad.login()).res.status).toBe(429);

    const good = browser();
    await good.request('GET', '/api/config');
    expect((await good.login()).res.status).toBe(200);
  });

  it('blocks the pair after 3 timeouts in a row, for good (AC-5.8)', async () => {
    const { browser, db } = await setup();
    const b = browser();
    await b.request('GET', '/api/config');
    for (let i = 0; i < 3; i++) {
      at(i * TIMEOUT);
      await b.fail(DEVICE_FAILS);
    }
    at(365 * 24 * 3600_000);
    const res = await b.login();
    expect(res.body).toEqual({ error: { code: 'device_blocked' } });
    expect(
      db
        .prepare(
          "SELECT last_email, user_agent, last_fail_at FROM login_guards WHERE kind = 'device'",
        )
        .get(),
    ).toEqual({
      last_email: ADMIN,
      user_agent: 'TestBrowser',
      last_fail_at: start + 2 * TIMEOUT,
    });
  });

  it('resets the pair, not the IP, on success (AC-5.9)', async () => {
    const { browser, rows } = await setup();
    const b = browser();
    await b.request('GET', '/api/config');
    await b.fail(DEVICE_FAILS - 1);
    expect((await b.login()).res.status).toBe(200);
    await b.fail(DEVICE_FAILS - 1);
    expect((await b.login()).res.status).toBe(200);
    expect(rows()).toEqual([
      expect.objectContaining({
        kind: 'ip',
        fail_count: 2 * (DEVICE_FAILS - 1),
      }),
    ]);
  });

  it('keeps open sessions working on a blocked device (AC-5.10)', async () => {
    const { browser, db, app } = await setup();
    const b = browser();
    await b.request('GET', '/api/config');
    const { session } = await b.login();
    await b.fail(1);
    db.prepare('UPDATE login_guards SET blocked_at = 1').run();
    expect((await b.login()).res.status).toBe(429);
    const me = await app.request('/api/auth/me', {
      headers: { cookie: `${session}; ${b.cookie}`, 'x-forwarded-for': IP },
    });
    expect(me.status).toBe(200);
  });
});

describe('IP limit (AC-5.8a)', () => {
  it('counts a request without a device cookie against the IP only', async () => {
    const { browser, rows } = await setup();
    await browser(IP, false).fail(2);
    expect(rows()).toEqual([
      expect.objectContaining({ kind: 'ip', ip: IP, fail_count: 2 }),
    ]);
  });

  it(`times the IP out after ${IP_FAILS} failures in an hour, whatever the cookies (E-5.8)`, async () => {
    const { browser } = await setup();
    // Each attempt with a fresh cookie looks like a new device.
    for (let i = 0; i < IP_FAILS; i++) {
      const b = browser();
      await b.request('GET', '/api/config');
      await b.fail();
    }
    const fresh = browser();
    await fresh.request('GET', '/api/config');
    expect((await fresh.login()).body).toEqual({
      error: {
        code: 'too_many_attempts',
        details: { retryAfterSec: TIMEOUT / 1000 },
      },
    });
    expect((await browser('198.51.100.1').login()).res.status).toBe(200);
  });

  it('forgets failures older than an hour', async () => {
    const { browser } = await setup();
    const b = browser(IP, false);
    await b.fail(IP_FAILS - 1);
    at(3600_000);
    await b.fail(IP_FAILS - 1);
    expect((await b.login()).res.status).toBe(200);
  });

  it('blocks the IP on the third timeout in a day, success or not', async () => {
    const { browser, db } = await setup();
    db.prepare(
      `INSERT INTO login_guards (kind, ip, fail_count, window_started_at, timeout_count,
         timeouts_window_started_at, last_fail_at) VALUES ('ip', ?, ?, ?, 2, ?, ?)`,
    ).run(IP, IP_FAILS - 1, start, start, start);
    const b = browser();
    await b.request('GET', '/api/config');
    await b.fail();
    expect((await b.login()).body).toEqual({ error: { code: 'ip_blocked' } });
  });

  it('puts ip_blocked before device_blocked, and the longer timeout first', async () => {
    const { browser, db } = await setup();
    const b = browser();
    await b.request('GET', '/api/config');
    await b.fail();
    const set = (kind: string, sql: string, ...args: unknown[]) =>
      db
        .prepare(`UPDATE login_guards SET ${sql} WHERE kind = '${kind}'`)
        .run(...args);

    set('ip', 'timeout_until = ?', start + 60_000);
    set('device', 'timeout_until = ?', start + 120_000);
    expect((await b.login()).body).toEqual({
      error: { code: 'too_many_attempts', details: { retryAfterSec: 120 } },
    });
    set('device', 'blocked_at = 1');
    expect((await b.login()).body).toEqual({
      error: { code: 'device_blocked' },
    });
    set('ip', 'blocked_at = 1');
    expect((await b.login()).body).toEqual({ error: { code: 'ip_blocked' } });
  });
});

it('prunes unblocked rows idle for a day on the next failure', async () => {
  const { browser, rows, db } = await setup();
  await browser('198.51.100.1', false).fail();
  const blocked = browser('198.51.100.2');
  await blocked.request('GET', '/api/config');
  await blocked.fail();
  db.prepare(
    "UPDATE login_guards SET blocked_at = 1 WHERE kind = 'device'",
  ).run();
  at(STALE_AFTER + 1);
  await browser(IP, false).fail();
  expect(rows()).toEqual([
    expect.objectContaining({ kind: 'device', ip: '198.51.100.2', blocked: 1 }),
    expect.objectContaining({ kind: 'ip', ip: IP }),
  ]);
});

describe('clientIp', () => {
  const ipOf = async (hops: number, xff?: string) => {
    const app = new Hono().get('/', (c) => c.text(clientIp(c, hops)));
    const res = await app.request(
      '/',
      { headers: xff ? { 'x-forwarded-for': xff } : {} },
      { incoming: { socket: { remoteAddress: '10.0.0.9' } } },
    );
    return res.text();
  };

  it.each([
    [0, '1.1.1.1, 2.2.2.2', '10.0.0.9'],
    [1, undefined, '10.0.0.9'],
    [1, '1.1.1.1', '1.1.1.1'],
    [1, 'forged, 1.1.1.1', '1.1.1.1'],
    [2, 'forged, 1.1.1.1, 2.2.2.2', '1.1.1.1'],
    [2, '2.2.2.2', '10.0.0.9'],
  ])('hops=%i, X-Forwarded-For %s → %s', async (hops, xff, ip) => {
    expect(await ipOf(hops, xff)).toBe(ip);
  });
});
