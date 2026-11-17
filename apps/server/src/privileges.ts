import { lchownSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ADR-0017: the image starts as root only to hand DATA_DIR to PUID:PGID, then drops to them
// before anything else runs. Must be the first import of every entry point.

/** PUID/PGID as positive integers; defaults 1000:1000. Throws on anything else, root included. */
export function parseIds(env: Record<string, string | undefined>) {
  const id = (name: 'PUID' | 'PGID') => {
    const raw = env[name] || '1000';
    if (!/^\d+$/.test(raw) || Number(raw) < 1)
      throw new Error(`${name} must be a positive integer, got "${raw}".`);
    return Number(raw);
  };
  return { uid: id('PUID'), gid: id('PGID') };
}

/** Gives every entry under `dir` to uid:gid; symlinks are not followed. */
function chownTree(dir: string, uid: number, gid: number) {
  const walk = (path: string) => {
    const s = lstatSync(path);
    if (s.uid !== uid || s.gid !== gid) lchownSync(path, uid, gid);
    if (s.isDirectory())
      for (const name of readdirSync(path)) walk(join(path, name));
  };
  walk(dir);
}

function dropPrivileges(env: Record<string, string | undefined>) {
  // Not root (`user:` in compose, rootless Docker, dev): nothing to drop.
  if (process.getuid?.() !== 0) return;
  let ids;
  try {
    ids = parseIds(env);
  } catch (err) {
    console.error(`[setup] ${(err as Error).message}`);
    process.exit(1);
  }
  // Same default as config.ts.
  const dir = env.DATA_DIR || './data';
  try {
    mkdirSync(dir, { recursive: true });
    chownTree(dir, ids.uid, ids.gid);
  } catch (err) {
    // SMB/ACL or read-only folders refuse chown; the write check at startup reports the outcome.
    console.error(
      `[setup] could not give ${dir} to ${ids.uid}:${ids.gid} (${(err as NodeJS.ErrnoException).code ?? (err as Error).message})`,
    );
  }
  process.setgroups!([ids.gid]);
  process.setgid!(ids.gid);
  process.setuid!(ids.uid);
}

dropPrivileges(process.env);
