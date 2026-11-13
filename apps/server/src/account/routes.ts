import { Hono } from 'hono';
import { accountSettingsPatchSchema, type AccountSettings } from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { validate } from '../http/validate.js';
import { bumpRev } from '../sync/rev.js';

/** Language, theme and units of one's own account (ADR-0011 §3, AC-0.3). */
export function accountRoutes({ db }: AppDeps) {
  const read = (userId: number) =>
    db
      .prepare(
        `SELECT locale, theme, units, settings_rev AS settingsRev
         FROM users WHERE id = ?`,
      )
      .get(userId) as AccountSettings;

  return new Hono<AuthEnv>().patch(
    '/account/settings',
    requireUser,
    validate('json', accountSettingsPatchSchema),
    (c) => {
      const userId = c.var.user.id;
      const { editedAt, ...fields } = c.req.valid('json');
      const changes = Object.entries(fields).filter(([, v]) => v !== undefined);
      db.transaction(() => {
        if (!changes.length) return;
        const { settings_edited_at: stored } = db
          .prepare('SELECT settings_edited_at FROM users WHERE id = ?')
          .get(userId) as { settings_edited_at: number | null };
        // Clamp to server time: a device with its clock ahead must not freeze settings.
        const now = Date.now();
        const at = Math.min(editedAt ?? now, now);
        // An offline edit made before the stored one loses (last edit wins).
        if (stored !== null && at < Math.min(stored, now)) return;
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
