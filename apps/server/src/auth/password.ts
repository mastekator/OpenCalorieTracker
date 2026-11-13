import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { passwordProblems } from '@oct/shared';
import { ApiError } from '../http/errors.js';

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/** ADR-0003: ~100 ms and 32 MB per hash on a Raspberry Pi 4. Tests may pass cheaper params. */
export const SCRYPT_PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 1 };

const derive = (password: string, salt: Buffer, { N, r, p }: ScryptParams) =>
  new Promise<Buffer>((resolve, reject) =>
    // Node's default maxmem (32 MB) is exactly 128·N·r, which scrypt rejects; allow twice that.
    scrypt(password, salt, 32, { N, r, p, maxmem: 256 * N * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );

/** `scrypt$N$r$p$salt$hash` (base64), so params can be raised later with a rehash on sign-in. */
export async function hashPassword(password: string, params = SCRYPT_PARAMS) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, params);
  const { N, r, p } = params;
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let dummy: Promise<string> | undefined;
/** Verified against when there is no real hash, so a missing account costs the same time (AC-5.2). */
export const dummyHash = () =>
  (dummy ??= hashPassword(randomBytes(16).toString('base64')));

let common: Set<string> | undefined;
export function isCommonPassword(password: string) {
  common ??= new Set(
    readFileSync(new URL('./common-passwords.txt', import.meta.url), 'utf8')
      .split('\n')
      .filter((line) => line && !line.startsWith('#')),
  );
  return common.has(password.toLowerCase());
}

/** Throws 400 password_invalid (with the broken rules) or password_too_common (AC-0.8). */
export function assertPasswordAllowed(password: string, email: string) {
  const problems = passwordProblems(password, email);
  if (problems.length) throw new ApiError(400, 'password_invalid', problems);
  if (isCommonPassword(password)) {
    throw new ApiError(400, 'password_too_common');
  }
}
