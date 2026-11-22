import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Database } from 'better-sqlite3';
import { draftPath, importsDir } from './draft.js';

/** A draft not committed within a day is abandoned (ADR-0026 §5). */
export const DRAFT_AGE_MS = 86_400_000;

// `<uuid>.part` of an upload in flight, `<id>.tmp` of a draft: only names the server creates.
const FILE_RE = /^(?:[0-9a-f-]{36}\.part|([1-9]\d*)\.tmp)$/;

/** Deletes drafts older than a day with their files, and day-old files no draft owns (deleted users, crashes). */
export async function sweepImports(db: Database, dataDir: string, now: number) {
  const before = now - DRAFT_AGE_MS;
  const ids = db
    .prepare(
      "DELETE FROM imports WHERE status = 'draft' AND created_at < ? RETURNING id",
    )
    .pluck()
    .all(before) as number[];
  await Promise.all(
    ids.map((id) => rm(draftPath(dataDir, id), { force: true })),
  );

  const dir = importsDir(dataDir);
  const draft = db.prepare(
    "SELECT 1 FROM imports WHERE id = ? AND status = 'draft'",
  );
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const match = FILE_RE.exec(name);
    if (!match || (match[1] && draft.get(Number(match[1])))) continue;
    const path = join(dir, name);
    // A fresh file may be an upload still being written.
    const { mtimeMs } = await stat(path).catch(() => ({ mtimeMs: now }));
    if (mtimeMs < before) await rm(path, { force: true });
  }
}
