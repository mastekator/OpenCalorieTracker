import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, 'check-forbidden-words.sh');
const dirs: string[] = [];

// git grep reads tracked files, so `git add` is enough and no commit (or git identity) is needed.
function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'oct-forbidden-'));
  dirs.push(dir);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  spawnSync('git', ['add', '-A'], { cwd: dir });
  return dir;
}

function run(cwd: string, words: string) {
  const r = spawnSync('sh', [SCRIPT], {
    cwd,
    env: { ...process.env, FORBIDDEN_WORDS: words },
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('check-forbidden-words.sh', () => {
  it('fails case-insensitively and prints only file:line', () => {
    const dir = repo({ 'docs/a.md': 'intro\nsee ForbiddenExample here\n' });
    const { code, out } = run(dir, 'forbiddenexample');
    expect(code).toBe(1);
    expect(out).toContain('::error file=docs/a.md,line=2::');
    expect(out.toLowerCase()).not.toContain('forbiddenexample');
    expect(out).not.toContain('see ');
  });

  it('skips with a warning when the list is empty', () => {
    const dir = repo({ 'a.md': 'forbiddenexample\n' });
    for (const words of ['', ' , ']) {
      const { code, out } = run(dir, words);
      expect(code).toBe(0);
      expect(out).toContain('::warning::');
    }
  });

  it('passes on a clean repo', () => {
    const { code, out } = run(
      repo({ 'a.md': 'nothing here\n' }),
      'forbiddenexample',
    );
    expect(code).toBe(0);
    expect(out).not.toContain('::error');
  });

  it('trims spaces and ignores empty items', () => {
    const dir = repo({ 'a.md': 'ok\n', 'b.md': 'x FORBIDDENEXAMPLE\n' });
    const { code, out } = run(dir, ' , forbiddenexample ,');
    expect(code).toBe(1);
    expect(out).toContain('::error file=b.md,line=1::');
  });

  it('counts matching paths without printing them', () => {
    const dir = repo({ 'docs/forbiddenexample-notes.md': 'clean\n' });
    const { code, out } = run(dir, 'forbiddenexample');
    expect(code).toBe(1);
    expect(out).toContain(
      '::error::1 tracked path(s) contain a forbidden word',
    );
    expect(out.toLowerCase()).not.toContain('forbiddenexample');
  });

  it('never prints a matching path, even with a content hit', () => {
    const dir = repo({
      'docs/forbiddenexample-notes.md': 'forbiddenexample\n',
      'b.md': 'forbiddenexample\n',
    });
    const { code, out } = run(dir, 'forbiddenexample');
    expect(code).toBe(1);
    expect(out).toContain('::error file=b.md,line=1::');
    expect(out).toContain('1 tracked path(s)');
    expect(out.toLowerCase()).not.toContain('forbiddenexample');
  });
});
