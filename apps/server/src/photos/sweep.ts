import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Database } from 'better-sqlite3';
import { bumpRev } from '../sync/rev.js';
import { photoPath } from './store.js';

export const SWEEP_INTERVAL_MS = 3_600_000;
/** An upload not saved into a meal within this time is abandoned (ADR-0008). */
export const ORPHAN_AGE_MS = 86_400_000;

// `<photoId>.jpg|.webp`, optionally with the `.tmp` suffix of an unfinished write.
const FILE_RE = /^([A-Za-z0-9_-]{22})\.(jpg|webp)(\.tmp)?$/;

const list = (dir: string) => readdir(dir).catch(() => [] as string[]);

/**
 * Deletes expired full photos (keeping the preview and the meal), files no meal owns older than
 * a day, and the photo folders of deleted users. Only names the server itself creates are touched.
 */
export async function sweepPhotos(db: Database, dataDir: string, now: number) {
  // DB first, files second: a crash in between leaves a stray file for the next sweep, never a meal without its photo.
  const expired = db.transaction(() => {
    const rows = db
      .prepare(
        `SELECT id, user_id AS userId, photo_id AS photoId FROM meals
         WHERE photo_full = 1 AND photo_expires_at < ?`,
      )
      .all(now) as { id: number; userId: number; photoId: string }[];
    const update = db.prepare(
      'UPDATE meals SET photo_full = 0, rev = ? WHERE id = ?',
    );
    for (const r of rows) update.run(bumpRev(db, r.userId), r.id);
    return rows;
  })();
  await Promise.all(
    expired.map((r) => {
      const path = photoPath(dataDir, r.userId, r.photoId, 'full');
      return path && rm(path, { force: true });
    }),
  );

  const root = join(dataDir, 'photos');
  const userExists = db.prepare('SELECT 1 FROM users WHERE id = ?');
  const meal = db.prepare(
    'SELECT photo_full FROM meals WHERE user_id = ? AND photo_id = ?',
  );
  for (const name of await list(root)) {
    if (!/^[1-9]\d*$/.test(name)) continue;
    const dir = join(root, name);
    const userId = Number(name);
    if (!userExists.get(userId)) {
      await rm(dir, { recursive: true, force: true });
      continue;
    }
    for (const file of await list(dir)) {
      const m = FILE_RE.exec(file);
      if (!m) continue;
      const row = meal.get(userId, m[1]) as { photo_full: number } | undefined;
      const kept = row && !m[3] && (m[2] === 'webp' || row.photo_full === 1);
      if (kept) continue;
      const path = join(dir, file);
      const info = await stat(path).catch(() => null);
      if (info && info.mtimeMs < now - ORPHAN_AGE_MS)
        await rm(path, { force: true });
    }
  }
}
