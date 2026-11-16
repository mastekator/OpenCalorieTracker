import type { Database } from 'better-sqlite3';
import type { ManualNorm, Profile } from '@oct/shared';
import { writeProfile } from '../profile/norm.js';
import { bumpRev } from '../sync/rev.js';

/** Saves the day's weighing, replacing one already there; call inside a transaction. */
export function putWeighing(
  db: Database,
  userId: number,
  date: string,
  weightKg: number,
) {
  db.prepare(
    `INSERT INTO weighings (user_id, date, weight_kg, rev, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, date) DO UPDATE SET
       weight_kg = excluded.weight_kg, rev = excluded.rev, updated_at = excluded.updated_at`,
  ).run(userId, date, weightKg, bumpRev(db, userId), Date.now());
}

/** Marks the day's weighing deleted (NULL keeps it for sync); no weighing is a no-op. Inside a transaction. */
export function deleteWeighing(db: Database, userId: number, date: string) {
  const exists = db
    .prepare(
      'SELECT 1 FROM weighings WHERE user_id = ? AND date = ? AND weight_kg IS NOT NULL',
    )
    .get(userId, date);
  if (!exists) return;
  db.prepare(
    'UPDATE weighings SET weight_kg = NULL, rev = ?, updated_at = ? WHERE user_id = ? AND date = ?',
  ).run(bumpRev(db, userId), Date.now(), userId, date);
}

/**
 * The profile weight follows the latest weighing by date (ADR-0016 §2); with no weighings the
 * profile is left as is, so deleting the last one never erases it (E-9.7). Inside a transaction.
 */
export function syncProfileWeight(db: Database, userId: number) {
  const latest = db
    .prepare(
      'SELECT weight_kg FROM weighings WHERE user_id = ? AND weight_kg IS NOT NULL ORDER BY date DESC LIMIT 1',
    )
    .pluck()
    .get(userId) as number | undefined;
  if (latest === undefined) return;
  const current = db
    .prepare('SELECT weight_kg FROM profiles WHERE user_id = ?')
    .pluck()
    .get(userId) as number | null | undefined;
  if (current === latest) return;
  db.prepare(
    `INSERT INTO profiles (user_id, weight_kg, rev, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       weight_kg = excluded.weight_kg, rev = excluded.rev, updated_at = excluded.updated_at`,
  ).run(userId, latest, bumpRev(db, userId), Date.now());
}

/**
 * Saves the profile; a new weight first becomes today's weighing (AC-9.10), so in the usual case
 * the profile's rev is the last one. The profile weight then follows the latest weighing either
 * way, so a full-replace PUT cannot drift from the diary. Inside a transaction.
 */
export function saveProfile(
  db: Database,
  userId: number,
  p: Profile,
  m: ManualNorm | null,
  oldWeightKg: number | null,
  today: string,
) {
  if (p.weightKg !== null && p.weightKg !== oldWeightKg)
    putWeighing(db, userId, today, p.weightKg);
  writeProfile(db, userId, p, m);
  syncProfileWeight(db, userId);
}
