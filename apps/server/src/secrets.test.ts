import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSecrets, secretsFrom } from './secrets.js';

const PURPOSE = 'ai_settings.api_key';

describe('seal/open', () => {
  const s = secretsFrom(randomBytes(32));

  it('round-trips with a fresh IV each time', () => {
    const a = s.seal('sk-secret', PURPOSE);
    const b = s.seal('sk-secret', PURPOSE);
    expect(a).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('sk-secret');
    expect(s.open(a, PURPOSE)).toBe('sk-secret');
  });

  it('is null with another key, another purpose or a broken value', () => {
    const sealed = s.seal('sk-secret', PURPOSE);
    expect(secretsFrom(randomBytes(32)).open(sealed, PURPOSE)).toBeNull();
    expect(s.open(sealed, 'other.field')).toBeNull();
    const [v, iv, tag, ct] = sealed.split('.');
    const flipped = (ct![0] === 'A' ? 'B' : 'A') + ct!.slice(1);
    expect(s.open([v, iv, tag, flipped].join('.'), PURPOSE)).toBeNull();
    expect(s.open([v, iv, 'AAAA', ct].join('.'), PURPOSE)).toBeNull();
    expect(s.open(`v2.${iv}.${tag}.${ct}`, PURPOSE)).toBeNull();
    expect(s.open('sk-secret', PURPOSE)).toBeNull();
  });
});

describe('loadSecrets', () => {
  let dir: string;
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true });
  });

  it('creates secret.key once with mode 0600 and reads it after a restart', async () => {
    dir = await mkdtemp(join(tmpdir(), 'oct-secrets-'));
    const sealed = loadSecrets(dir).seal('k', PURPOSE);
    const file = join(dir, 'secret.key');
    expect((await readFile(file)).length).toBe(32);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(loadSecrets(dir).open(sealed, PURPOSE)).toBe('k');
  });

  it('never overwrites a broken key file and logs it (E-2)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'oct-secrets-'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const file = join(dir, 'secret.key');
    await writeFile(file, 'short');
    const s = loadSecrets(dir);
    expect(s.open(s.seal('k', PURPOSE), PURPOSE)).toBe('k');
    expect(await readFile(file, 'utf8')).toBe('short');
    expect(error.mock.calls[0]![0]).toMatch(/^\[setup\] .* is not 32 bytes/);
  });
});
