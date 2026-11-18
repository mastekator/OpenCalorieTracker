import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
} from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Authenticated encryption of stored secrets (ADR-0018 §1). `purpose` binds a value to its field. */
export interface Secrets {
  /** `v1.<iv>.<tag>.<ciphertext>`, base64url, a fresh IV on every call. */
  seal(plain: string, purpose: string): string;
  /** The plain text, or null when it does not decrypt (another key, purpose or format). */
  open(sealed: string, purpose: string): string | null;
}

export function secretsFrom(key: Buffer): Secrets {
  return {
    seal(plain, purpose) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv) as CipherGCM;
      cipher.setAAD(Buffer.from(purpose));
      const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return [
        'v1',
        ...[iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url')),
      ].join('.');
    },
    open(sealed, purpose) {
      const [version, iv, tag, ct, ...rest] = sealed.split('.');
      if (version !== 'v1' || ct === undefined || rest.length) return null;
      try {
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(iv!, 'base64url'),
          { authTagLength: 16 },
        );
        decipher.setAAD(Buffer.from(purpose));
        decipher.setAuthTag(Buffer.from(tag!, 'base64url'));
        return Buffer.concat([
          decipher.update(Buffer.from(ct, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        return null;
      }
    },
  };
}

/**
 * The key from `<dataDir>/secret.key`, created on first start (32 bytes, 0600). An existing file is
 * never overwritten: if it is unreadable or not 32 bytes, a throwaway key is used and saved secrets
 * read as null (E-2). Null dataDir (unwritable, in-memory database): a throwaway key.
 */
export function loadSecrets(dataDir: string | null): Secrets {
  if (!dataDir) return secretsFrom(randomBytes(32));
  const path = join(dataDir, 'secret.key');
  try {
    const key = randomBytes(32);
    writeFileSync(path, key, { flag: 'wx', mode: 0o600 });
    return secretsFrom(key);
  } catch (err) {
    // EEXIST: created before, or by a parallel start; read it below.
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      console.error(
        `[setup] ${path} cannot be created (${(err as NodeJS.ErrnoException).code}); saved AI keys will not survive a restart.`,
      );
      return secretsFrom(randomBytes(32));
    }
  }
  try {
    const key = readFileSync(path);
    if (key.length === 32) return secretsFrom(key);
    console.error(
      `[setup] ${path} is not 32 bytes; saved AI keys cannot be read.`,
    );
  } catch (err) {
    console.error(
      `[setup] ${path} cannot be read (${(err as NodeJS.ErrnoException).code}); saved AI keys cannot be read.`,
    );
  }
  return secretsFrom(randomBytes(32));
}
