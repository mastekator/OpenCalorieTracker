import { rm } from 'node:fs/promises';
import type { Database } from 'better-sqlite3';
import { photoPath } from '../photos/store.js';
import type { Config } from '../config.js';
import { bumpRev } from '../sync/rev.js';
import { enqueueMealSaved } from '../webhooks/outbox.js';
import type { MealRow } from './read.js';

type Removable = Pick<
  MealRow,
  'id' | 'client_id' | 'photo_id' | 'local_date' | 'meal_type'
>;

/**
 * Deletes the user's meals with a tombstone each (ADR-0010) in one transaction, then their photos.
 * With `notify` each deletion queues `meal.saved` for webhooks; an import's undo passes none.
 */
export async function deleteMeals(
  db: Database,
  dataDir: string,
  userId: number,
  meals: readonly Removable[],
  notify?: Pick<Config, 'outbound' | 'tokens'>,
) {
  const remove = db.prepare('DELETE FROM meals WHERE id = ?');
  const tombstone = db.prepare(
    `INSERT INTO meal_tombstones (user_id, client_id, rev) VALUES (?, ?, ?)
     ON CONFLICT (user_id, client_id) DO UPDATE SET rev = excluded.rev`,
  );
  db.transaction(() => {
    for (const m of meals) {
      remove.run(m.id);
      tombstone.run(userId, m.client_id, bumpRev(db, userId));
      if (notify)
        enqueueMealSaved(db, notify, userId, 'deleted', () => ({
          id: m.id,
          clientId: m.client_id,
          localDate: m.local_date,
          mealType: m.meal_type,
        }));
    }
  })();
  // After the commit: a crash in between leaves orphan files for the cleanup job (OCT-52).
  await Promise.all(
    meals.flatMap((m) =>
      m.photo_id
        ? (['full', 'preview'] as const).map((s) => {
            const path = photoPath(dataDir, userId, m.photo_id!, s);
            return path && rm(path, { force: true });
          })
        : [],
    ),
  );
}
