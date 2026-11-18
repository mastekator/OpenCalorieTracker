import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureAdmin, resetAdminAccess } from '../auth/admin.js';
import { testApp } from '../test/app.js';
import {
  checkSetupCode,
  newSetupCode,
  normalizeSetupCode,
  SETUP_CODE_MAX_FAILS,
  SETUP_CODE_TTL,
} from './code.js';

const wizardEnv = { ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined };
const CODE = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;

let logs: string[];
beforeEach(() => {
  logs = [];
  for (const level of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Starts the server steps once and returns the code from the log block. */
async function start(t: ReturnType<typeof testApp>) {
  await ensureAdmin(t.config, t.db);
  return logs
    .join('\n')
    .match(
      /Setup code: (\S+) \(valid until \d{4}-\d\d-\d\d \d\d:\d\d UTC\)/,
    )?.[1];
}

describe('setup code format (ADR-0021 §2)', () => {
  it('is XXXX-XXXX over the 31-symbol alphabet', () => {
    const { db } = testApp(wizardEnv);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { code } = newSetupCode(db);
      expect(code).toMatch(CODE);
      for (const c of code.replace('-', '')) seen.add(c);
    }
    expect([...seen].some((c) => '0O1IL'.includes(c))).toBe(false);
    expect(seen.size).toBe(31);
  });

  it('normalizes case, spaces and dashes, and rejects the rest', () => {
    expect(normalizeSetupCode(' k7qm-3xrp ')).toBe('K7QM3XRP');
    expect(normalizeSetupCode('K7QM 3XRP')).toBe('K7QM3XRP');
    expect(normalizeSetupCode('K7QM3XR')).toBeNull();
    expect(normalizeSetupCode('K7QM3XRP9')).toBeNull();
    expect(normalizeSetupCode('K7QM-3XR0')).toBeNull();
    expect(normalizeSetupCode('K7QM_3XRP')).toBeNull();
  });
});

describe('setup code on start (ADR-0021 §2)', () => {
  it('logs a block with the code and the URL; a new start makes the old one invalid', async () => {
    const t = testApp(wizardEnv);
    const first = await start(t);
    expect(first).toMatch(CODE);
    expect(logs.join('\n')).toContain(
      'Open http://localhost:3000 to create the admin account.',
    );
    expect(checkSetupCode(t.db, first!.toLowerCase())).toBe('ok');

    logs = [];
    const second = await start(t);
    expect(second).not.toBe(first);
    expect(checkSetupCode(t.db, second!)).toBe('ok');
    expect(checkSetupCode(t.db, first!)).toBe('invalid');
  });

  it('keeps no code once an admin exists', async () => {
    const t = testApp(wizardEnv);
    await start(t);
    t.db
      .prepare(
        "INSERT INTO users (email, role, webauthn_user_id, created_at) VALUES ('a@b.c', 'admin', x'01', 0)",
      )
      .run();
    logs = [];
    expect(await start(t)).toBeUndefined();
    expect(t.db.prepare('SELECT 1 FROM setup_code').get()).toBeUndefined();
  });

  it('logs no code outside wizard mode, and never the admin email or password', async () => {
    for (const env of [
      {},
      { ADMIN_EMAIL: undefined },
      { PUBLIC_URL: undefined },
    ]) {
      const t = testApp(env);
      expect(await start(t)).toBeUndefined();
      expect(t.db.prepare('SELECT 1 FROM setup_code').get()).toBeUndefined();
    }
    const all = logs.join('\n');
    expect(all).not.toContain('admin@example.com');
    expect(all).not.toContain('Correct-horse-battery-9');
  });

  it('never seeds an admin without ADMIN_EMAIL', async () => {
    const t = testApp(wizardEnv);
    await start(t);
    expect(t.db.prepare('SELECT 1 FROM users').get()).toBeUndefined();
  });
});

describe('checkSetupCode (ADR-0021 §3)', () => {
  it('expires after 24 hours', () => {
    const { db } = testApp(wizardEnv);
    const now = Date.now();
    const { code, expiresAt } = newSetupCode(db, now);
    expect(expiresAt).toBe(now + SETUP_CODE_TTL);
    expect(checkSetupCode(db, code, expiresAt - 1)).toBe('ok');
    expect(checkSetupCode(db, code, expiresAt)).toBe('expired');
  });

  it('burns on the 5th wrong code, warns once, and then refuses the right one', () => {
    const { db } = testApp(wizardEnv);
    const { code } = newSetupCode(db);
    for (let i = 1; i <= SETUP_CODE_MAX_FAILS; i++) {
      expect(checkSetupCode(db, i % 2 ? 'AAAA-AAAA' : 'garbage')).toBe(
        'invalid',
      );
    }
    expect(checkSetupCode(db, 'AAAA-AAAA')).toBe('burned');
    expect(checkSetupCode(db, code)).toBe('burned');
    const warns = logs.filter((l) => l.startsWith('[warn] setup code burned'));
    expect(warns).toHaveLength(1);
    expect(warns[0]).not.toContain(code);
  });

  it('counts nothing for states', () => {
    const { db } = testApp(wizardEnv);
    expect(checkSetupCode(db, 'AAAA-AAAA')).toBe('burned');
    const { code, expiresAt } = newSetupCode(db);
    expect(checkSetupCode(db, 'AAAA-AAAA', expiresAt)).toBe('expired');
    expect(db.prepare('SELECT fail_count FROM setup_code').get()).toEqual({
      fail_count: 0,
    });
    db.prepare(
      "INSERT INTO users (email, role, webauthn_user_id, created_at) VALUES ('a@b.c', 'admin', x'01', 0)",
    ).run();
    expect(checkSetupCode(db, code)).toBe('done');
  });
});

describe('reset-admin-access in wizard mode (ADR-0021 §8)', () => {
  it('lifts blocks and issues a new code the server accepts', async () => {
    const t = testApp(wizardEnv);
    const old = await start(t);
    t.db
      .prepare(
        `INSERT INTO login_guards (kind, ip, device_id, blocked_at, timeout_until)
         VALUES ('ip', '203.0.113.7', '', 1, NULL)`,
      )
      .run();
    const result = resetAdminAccess(t.config, t.db);
    expect(result).toMatchObject({
      cleared: 1,
      code: expect.stringMatching(CODE),
    });
    expect(checkSetupCode(t.db, (result as { code: string }).code)).toBe('ok');
    expect(checkSetupCode(t.db, old!)).toBe('invalid');
  });
});
