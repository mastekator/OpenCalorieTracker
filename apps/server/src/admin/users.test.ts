import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCookie } from '../test/app.js';
import { aiSetup } from '../test/ai.js';
import { DEVICE_FAILS, IP_FAILS, TIMEOUTS_TO_BLOCK } from '../auth/guard.js';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

let cleanup: (() => Promise<void>) | undefined;
const setup = async () => {
  const t = await aiSetup(null);
  cleanup = t.cleanup;
  const call = (method: string, path: string, cookie = t.cookie) =>
    t.app.request(path, {
      method,
      headers: { cookie, origin: 'http://localhost:3000', 'user-agent': UA },
    });
  const userId = (email: string) =>
    (
      t.db.prepare('SELECT id FROM users WHERE email = ?').get(email) as {
        id: number;
      }
    ).id;
  return { ...t, call, userId };
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup?.();
  cleanup = undefined;
});

describe('admin users (AC-8.1)', () => {
  it('lists users in registration order', async () => {
    const t = await setup();
    const res = await t.call('GET', '/api/admin/users');
    expect(await res.json()).toEqual([
      {
        id: t.userId('b@example.com'),
        email: 'b@example.com',
        name: null,
        role: 'user',
        createdAt: 0,
        lastLoginAt: null,
      },
      {
        id: t.userId('admin@example.com'),
        email: 'admin@example.com',
        name: null,
        role: 'admin',
        createdAt: expect.any(Number),
        lastLoginAt: expect.any(Number),
      },
    ]);
  });

  it('refuses every admin route to a regular user (AC-8.5)', async () => {
    const t = await setup();
    const user = await t.signIn('b@example.com');
    const admin = t.userId('admin@example.com');
    for (const [method, path] of [
      ['GET', '/api/admin/users'],
      ['DELETE', `/api/admin/users/${admin}`],
      ['GET', '/api/admin/blocks'],
      ['DELETE', '/api/admin/blocks/1'],
    ] as const) {
      expect((await t.call(method, path, user)).status).toBe(403);
    }
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({
      n: 2,
    });
  });
});

describe('DELETE /api/admin/users/:id', () => {
  it('refuses to delete yourself (AC-8.4) and an unknown id', async () => {
    const t = await setup();
    const self = await t.call(
      'DELETE',
      `/api/admin/users/${t.userId('admin@example.com')}`,
    );
    expect(self.status).toBe(409);
    expect(await self.json()).toEqual({
      error: { code: 'cannot_delete_self' },
    });
    expect((await t.call('DELETE', '/api/admin/users/999')).status).toBe(404);
    expect((await t.call('DELETE', '/api/admin/users/x')).status).toBe(404);
  });

  it('removes the user with sessions, data and photos, and frees the email (AC-8.3)', async () => {
    const t = await setup();
    const id = t.userId('b@example.com');
    const session = await t.signIn('b@example.com');
    const dir = join(t.dataDir, 'photos', String(id));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'x.jpg'), 'x');
    const other = join(
      t.dataDir,
      'photos',
      String(t.userId('admin@example.com')),
    );
    await mkdir(other, { recursive: true });

    expect((await t.call('DELETE', `/api/admin/users/${id}`)).status).toBe(204);

    expect((await t.call('GET', '/api/auth/me', session)).status).toBe(401);
    expect(existsSync(dir)).toBe(false);
    expect(existsSync(other)).toBe(true);
    // Every table pointing at users must let go of the row: CASCADE or SET NULL, never a leftover.
    const tables = t.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    for (const { name } of tables) {
      const fks = t.db.pragma(`foreign_key_list(${name})`) as {
        table: string;
        from: string;
        on_delete: string;
      }[];
      for (const fk of fks.filter((f) => f.table === 'users')) {
        expect([name, fk.on_delete]).toEqual([
          name,
          expect.stringMatching(/^(CASCADE|SET NULL)$/),
        ]);
        expect(
          t.db.prepare(`SELECT 1 FROM ${name} WHERE ${fk.from} = ?`).get(id),
        ).toBeUndefined();
      }
    }
    const invite = await t.app.request('/api/admin/invites', {
      method: 'POST',
      headers: { cookie: t.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'b@example.com' }),
    });
    expect(invite.status).toBe(201);
  });
});

describe('admin blocks (AC-8.2)', () => {
  /** One failed sign-in from an iPhone, then its rows marked as blocked after 3 timeouts. */
  const blockDevice = async (t: Awaited<ReturnType<typeof setup>>) => {
    const config = await t.app.request('/api/config', {
      headers: { 'user-agent': UA },
    });
    const device = setCookie(config, 'oct_device')!.split(';')[0]!;
    const login = (password: string) =>
      t.app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': UA,
          cookie: device,
        },
        body: JSON.stringify({ email: 'b@example.com', password }),
      });
    await login('Wrong-pass-1');
    t.db
      .prepare(
        `UPDATE login_guards SET blocked_at = 1000, timeout_count = ?, fail_count = 0 WHERE kind = 'device'`,
      )
      .run(TIMEOUTS_TO_BLOCK);
    return login;
  };

  it('lists blocks only, not timeouts', async () => {
    const t = await setup();
    await blockDevice(t);
    // The IP row holds one failure and no block: it is not listed.
    const res = await t.call('GET', '/api/admin/blocks');
    expect(await res.json()).toEqual([
      {
        id: expect.any(Number),
        kind: 'device',
        ip: expect.any(String),
        device: 'iPhone · Safari',
        blockedAt: 1000,
        failCount: TIMEOUTS_TO_BLOCK * DEVICE_FAILS,
        lastEmail: 'b@example.com',
      },
    ]);

    t.db
      .prepare(
        "UPDATE login_guards SET blocked_at = 2000, timeout_count = 3, fail_count = 0 WHERE kind = 'ip'",
      )
      .run();
    expect(await (await t.call('GET', '/api/admin/blocks')).json()).toEqual([
      expect.objectContaining({
        kind: 'ip',
        device: null,
        failCount: 3 * IP_FAILS,
      }),
      expect.objectContaining({ kind: 'device' }),
    ]);
  });

  it('lifts a block so the device can sign in again', async () => {
    const t = await setup();
    const login = await blockDevice(t);
    expect((await login('Correct-horse-battery-9')).status).toBe(429);
    const [block] = (await (
      await t.call('GET', '/api/admin/blocks')
    ).json()) as { id: number }[];

    expect(
      (await t.call('DELETE', `/api/admin/blocks/${block!.id}`)).status,
    ).toBe(204);
    expect(await (await t.call('GET', '/api/admin/blocks')).json()).toEqual([]);
    expect((await login('Correct-horse-battery-9')).status).toBe(200);
    expect(
      (await t.call('DELETE', `/api/admin/blocks/${block!.id}`)).status,
    ).toBe(404);

    const ip = t.db
      .prepare("SELECT id FROM login_guards WHERE kind = 'ip'")
      .get() as { id: number };
    // A timeout or plain counter is not a block and cannot be lifted here.
    expect((await t.call('DELETE', `/api/admin/blocks/${ip.id}`)).status).toBe(
      404,
    );
  });
});
