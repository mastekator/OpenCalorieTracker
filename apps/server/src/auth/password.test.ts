import { describe, expect, it } from 'vitest';
import { ApiError } from '../http/errors.js';
import {
  assertPasswordAllowed,
  hashPassword,
  isCommonPassword,
  verifyPassword,
} from './password.js';

const cheap = { N: 2 ** 10, r: 8, p: 1 };

describe('scrypt hash', () => {
  it('stores params, salt and key, and verifies with the params it carries', async () => {
    const hash = await hashPassword('Pasta-2-go', cheap);
    expect(hash).toMatch(/^scrypt\$1024\$8\$1\$[\w+/]+=*\$[\w+/]+=*$/);
    expect(await verifyPassword('Pasta-2-go', hash)).toBe(true);
    expect(await verifyPassword('pasta-2-go', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('x', cheap)).not.toBe(
      await hashPassword('x', cheap),
    );
  });

  it('uses the ADR params by default', async () => {
    expect(await hashPassword('x')).toMatch(/^scrypt\$32768\$8\$1\$/);
  });

  it('rejects malformed hashes', async () => {
    expect(await verifyPassword('x', 'bcrypt$whatever')).toBe(false);
  });
});

describe('password policy on the server', () => {
  it('knows common passwords regardless of case', () => {
    expect(isCommonPassword('Password')).toBe(true);
    expect(isCommonPassword('Pasta-2-go')).toBe(false);
  });

  it('reports the broken rules', () => {
    const error = (password: string) => {
      try {
        assertPasswordAllowed(password, 'me@example.com');
      } catch (e) {
        return e instanceof ApiError ? [e.code, e.details] : e;
      }
    };
    expect(error('short')).toEqual([
      'password_invalid',
      ['length', 'digit', 'symbol'],
    ]);
    expect(error('Pasta-2-go')).toBeUndefined();
  });
});
