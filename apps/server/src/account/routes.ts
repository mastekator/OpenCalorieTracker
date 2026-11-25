import type { Database } from 'better-sqlite3';
import { Hono } from 'hono';
import {
  accountSettingsPatchSchema,
  photoRetentionImpactQuerySchema,
  photoRetentionSchema,
  type AccountSettings,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { validate } from '../http/validate.js';
import { sweepPhotos } from '../photos/sweep.js';
import { bumpRev } from '../sync/rev.js';

const DAY_MS = 86_400_000;

export const readSettings = (db: Database, userId: number): AccountSettings => {
  const row = db
    .prepare(
      `SELECT locale, theme, units, settings_rev AS settingsRev,
       photo_retention_days AS photoRetentionDays, norm_disclaimer_hidden AS normDisclaimerHidden,
       off_enabled AS offEnabled, off_hint_at AS offHintAt, time_zone AS timeZone
       FROM users WHERE id = ?`,
    )
    .get(userId) as Omit<
    AccountSettings,
    'normDisclaimerHidden' | 'offEnabled'
  > & { normDisclaimerHidden: 0 | 1; offEnabled: 0 | 1 };
  return {
    ...row,
    normDisclaimerHidden: row.normDisclaimerHidden === 1,
    offEnabled: row.offEnabled === 1,
  };
};

/** Patch keys whose column name differs from the key. */
const COLUMNS: Record<string, string> = {
  offEnabled: 'off_enabled',
  offHintAt: 'off_hint_at',
};

/** Language, theme, units and photo retention of one's own account (ADR-0011 §3, AC-0.3, ADR-0008). */
export function accountRoutes({ db, config }: AppDeps) {
  const read = (userId: number) => readSettings(db, userId);

  // Same expiry as a new meal gets (eaten_at + days) and the same `< now` as the sweep,
  // so the impact count matches what PUT deletes. days = 0 expires at eaten_at.
  const expiry =
    'CASE WHEN @days IS NULL THEN NULL ELSE eaten_at + @days * @dayMs END';

  return new Hono<AuthEnv>()
    .get('/account/settings', requireUser, (c) => c.json(read(c.var.user.id)))
    .get(
      '/account/photo-retention/impact',
      requireUser,
      validate('query', photoRetentionImpactQuerySchema),
      (c) => {
        const willDelete = db
          .prepare(
            `SELECT COUNT(*) FROM meals
             WHERE user_id = @userId AND photo_full = 1 AND ${expiry} < @now`,
          )
          .pluck()
          .get({
            userId: c.var.user.id,
            days: c.req.valid('query').days,
            dayMs: DAY_MS,
            now: Date.now(),
          }) as number;
        return c.json({ willDelete });
      },
    )
    .put(
      '/account/photo-retention',
      requireUser,
      validate('json', photoRetentionSchema),
      async (c) => {
        const userId = c.var.user.id;
        const { days } = c.req.valid('json');
        db.transaction(() => {
          // settings_rev moves so other devices pick up the new period on sync (ADR-0011 §3).
          db.prepare(
            'UPDATE users SET photo_retention_days = ?, settings_rev = ? WHERE id = ?',
          ).run(days, bumpRev(db, userId), userId);
          // Clients never see photo_expires_at, so rev is bumped only when the sweep drops a photo.
          db.prepare(
            `UPDATE meals SET photo_expires_at = ${expiry}
             WHERE user_id = @userId AND photo_full = 1`,
          ).run({ userId, days, dayMs: DAY_MS });
        })();
        // The setting is saved; a failed sweep is retried hourly and must not fail the request.
        await sweepPhotos(db, config.dataDir, Date.now()).catch((err) =>
          console.error(`[photos] sweep failed: ${(err as Error).message}`),
        );
        return c.json({ days });
      },
    )
    .patch(
      '/account/settings',
      requireUser,
      validate('json', accountSettingsPatchSchema),
      (c) => {
        const userId = c.var.user.id;
        const { editedAt, normDisclaimerHidden, timeZone, ...fields } =
          c.req.valid('json');
        const changes = Object.entries(fields)
          .filter(([, v]) => v !== undefined)
          // SQLite has no booleans.
          .map(([k, v]) => [COLUMNS[k] ?? k, typeof v === 'boolean' ? +v : v]);
        db.transaction(() => {
          // The device's zone, not an edit: no last-edit-wins and no settingsRev, so two devices
          // in different zones do not bounce settings through sync (ADR-0027 §4).
          if (timeZone)
            db.prepare('UPDATE users SET time_zone = ? WHERE id = ?').run(
              timeZone,
              userId,
            );
          // Only ever set, so it cannot conflict and an old offline edit must not lose it.
          if (normDisclaimerHidden)
            db.prepare(
              'UPDATE users SET norm_disclaimer_hidden = 1, settings_rev = ? WHERE id = ? AND norm_disclaimer_hidden = 0',
            ).run(bumpRev(db, userId), userId);
          if (!changes.length) return;
          const { settings_edited_at: stored } = db
            .prepare('SELECT settings_edited_at FROM users WHERE id = ?')
            .get(userId) as { settings_edited_at: number | null };
          // Clamp to server time: a device with its clock ahead must not freeze settings.
          const now = Date.now();
          const at = Math.min(editedAt ?? now, now);
          // An offline edit made before the stored one loses (last edit wins); a future stored
          // time, written before clamping existed, blocks nothing.
          if (stored !== null && stored <= now && at < stored) return;
          // Keys come from the zod schema, never from the client, so interpolating them is safe.
          const set = changes.map(([k]) => `${k} = ?`).join(', ');
          db.prepare(
            `UPDATE users SET ${set}, settings_edited_at = ?, settings_rev = ? WHERE id = ?`,
          ).run(...changes.map(([, v]) => v), at, bumpRev(db, userId), userId);
        })();
        return c.json(read(userId));
      },
    );
}
