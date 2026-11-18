import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Database } from 'better-sqlite3';

/** Thresholds of the setup code (ADR-0021 §2); changed by PR, like the guard's. */
export const SETUP_CODE_TTL = 24 * 60 * 60 * 1000;
export const SETUP_CODE_MAX_FAILS = 5;
// 31 symbols without 0 O 1 I L, which are easy to misread in a log.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 8;

/** Upper case without spaces and dashes; null when it cannot be a code at all. */
export function normalizeSetupCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return code.length === LENGTH && [...code].every((c) => ALPHABET.includes(c))
    ? code
    : null;
}

const sha256 = (code: string) => createHash('sha256').update(code).digest();

/** Replaces any previous code (AC-1.4); only its hash is stored. Returns it as `XXXX-XXXX`. */
export function newSetupCode(db: Database, now = Date.now()) {
  const code = Array.from(
    { length: LENGTH },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join('');
  const expiresAt = now + SETUP_CODE_TTL;
  db.prepare(
    'INSERT OR REPLACE INTO setup_code (id, hash, expires_at, fail_count) VALUES (1, ?, ?, 0)',
  ).run(sha256(code), expiresAt);
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt };
}

/**
 * `invalid` is the only result the caller counts as a failed attempt for the guard; the others
 * are states, not guesses (ADR-0021 §3).
 */
export type SetupCodeCheck = 'ok' | 'invalid' | 'expired' | 'burned' | 'done';

export function checkSetupCode(
  db: Database,
  input: string,
  now = Date.now(),
): SetupCodeCheck {
  if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) return 'done';
  const row = db
    .prepare('SELECT hash, expires_at, fail_count FROM setup_code WHERE id = 1')
    .get() as
    { hash: Buffer; expires_at: number; fail_count: number } | undefined;
  if (!row || row.fail_count >= SETUP_CODE_MAX_FAILS) return 'burned';
  if (row.expires_at <= now) return 'expired';
  const code = normalizeSetupCode(input);
  if (code && timingSafeEqual(sha256(code), row.hash)) return 'ok';
  const { fail_count } = db
    .prepare(
      'UPDATE setup_code SET fail_count = fail_count + 1 WHERE id = 1 RETURNING fail_count',
    )
    .get() as { fail_count: number };
  if (fail_count === SETUP_CODE_MAX_FAILS) {
    console.warn(
      `[warn] setup code burned after ${SETUP_CODE_MAX_FAILS} wrong attempts; restart the container for a new one`,
    );
  }
  return 'invalid';
}

/** The stored form of a code that checkSetupCode() accepted. */
export const setupCodeHash = (input: string) =>
  sha256(normalizeSetupCode(input) ?? '');

/**
 * Deletes the code inside the transaction that creates the admin, so of two requests with the
 * right code only one gets `ok` (E-3.1). Anything else must roll that transaction back.
 */
export function consumeSetupCode(
  db: Database,
  hash: Buffer,
  now = Date.now(),
): Exclude<SetupCodeCheck, 'invalid'> {
  if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) return 'done';
  const { changes } = db
    .prepare(
      'DELETE FROM setup_code WHERE id = 1 AND hash = ? AND fail_count < ? AND expires_at > ?',
    )
    .run(hash, SETUP_CODE_MAX_FAILS, now);
  if (changes) return 'ok';
  const row = db
    .prepare('SELECT expires_at, fail_count FROM setup_code WHERE id = 1')
    .get() as { expires_at: number; fail_count: number } | undefined;
  if (!row || row.fail_count >= SETUP_CODE_MAX_FAILS) return 'burned';
  // A live row with another hash: a restart or reset-admin-access replaced this code.
  return 'expired';
}

/** `YYYY-MM-DD HH:MM UTC`, as the log and the CLI show it. */
export const utcMinutes = (time: number) =>
  `${new Date(time).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

/** The one log block that holds the code (AC-1.1). */
export function setupCodeBanner(
  code: string,
  expiresAt: number,
  publicUrl: string,
) {
  const rule = '='.repeat(58);
  return [
    rule,
    `Setup code: ${code} (valid until ${utcMinutes(expiresAt)})`,
    `Open ${publicUrl} to create the admin account.`,
    rule,
  ].join('\n');
}
